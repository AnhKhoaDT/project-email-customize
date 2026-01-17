import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as cron from 'node-cron';
import { EmailMetadata, EmailMetadataDocument } from './schemas/email-metadata.schema';
import { GmailService } from './gmail.service';
import { KanbanConfigService } from './kanban-config.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

const logger = new Logger('SnoozeService');

@Injectable()
export class SnoozeService implements OnModuleInit {
  private cronJob: cron.ScheduledTask;

  constructor(
    @InjectModel(EmailMetadata.name)
    private emailMetadataModel: Model<EmailMetadataDocument>,
    private gmailService: GmailService,
    private kanbanConfigService: KanbanConfigService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Khởi động cron job khi module start
   */
  onModuleInit() {
    // Chạy mỗi 5 giây để check emails cần unsnooze (tốt cho demo với snooze 5s/10s)
    // Production với snooze thực tế (giờ/ngày): dùng '* * * * *' (mỗi phút)
    this.cronJob = cron.schedule('*/5 * * * * *', async () => {
      await this.processExpiredSnoozes();
    });
    
    logger.log('✅ Snooze scheduler started - checking every 5 seconds');
  }

  /**
   * Snooze một email (chỉ cho emails đã trong Kanban)
   */
  async snoozeEmail(
    userId: string,
    emailId: string,
    snoozedUntil: Date,
  ) {
    try {
      // BƯỚC 1: Lấy current column từ DB (email phải đã trong Kanban)
      const metadata = await this.emailMetadataModel.findOne({ userId, emailId });
      
      if (!metadata) {
        throw new Error('Email not in Kanban. Only Kanban emails can be snoozed.');
      }

      const originalColumnId = metadata.kanbanColumnId; // Lưu column hiện tại

      // BƯỚC 2: Lưu snooze data vào MongoDB
      await this.emailMetadataModel.findOneAndUpdate(
        { userId, emailId },
        {
          snoozedUntil,
          previousColumnId: originalColumnId, // Sử dụng previousColumnId thay vì originalStatus
          isSnoozed: true,
          // Move to a reserved bucket so frontend hides it from normal columns
          kanbanColumnId: 'SNOOZED_POOL',
        },
        { new: true },
      );

      logger.log(`✅ Snoozed email ${emailId} until ${snoozedUntil.toISOString()}`);
      
      return {
        success: true,
        message: `Email snoozed until ${snoozedUntil.toLocaleString()}`,
        snoozedUntil
      };

    } catch (error) {
      logger.error(`Failed to snooze email ${emailId}:`, error);
      throw error;
    }
  }

  /**
   * Unsnooze email manually
   */
  async unsnoozeEmail(userId: string, emailId: string) {
    try {
      const metadata = await this.emailMetadataModel.findOne({ userId, emailId });
      
      if (!metadata || !metadata.isSnoozed) {
        throw new Error('Email is not snoozed');
      }

      // Fetch labels once for this user and pass to restore to avoid an extra call inside restore
      const allLabels = await this.gmailService.listLabels(userId).catch(() => []);
      await this.restoreEmail(userId, emailId, metadata.previousColumnId, allLabels);

      logger.log(`✅ Manually unsnoozed email ${emailId}`);
      
      return { success: true, message: 'Email restored' };
    } catch (error) {
      logger.error(`Failed to unsnooze email ${emailId}:`, error);
      throw error;
    }
  }

  /**
   * Get all snoozed emails for a user
   */
  async getSnoozedEmails(userId: string) {
    return this.emailMetadataModel.find({
      userId,
      isSnoozed: true
    }).sort({ snoozedUntil: 1 }); // Sort by wake up time
  }

  /**
   * Cron job: Process expired snoozes
   */
  private async processExpiredSnoozes() {
    try {
      const now = new Date();
      
      // Tìm tất cả emails đã hết snooze time
      const expiredSnoozes = await this.emailMetadataModel.find({
        isSnoozed: true,
        snoozedUntil: { $lte: now }
      });

      if (expiredSnoozes.length === 0) {
        return; // No emails to process
      }

      logger.log(`⏰ Processing ${expiredSnoozes.length} expired snoozes...`);

      // Group expired snoozes by user to avoid N+1 calls to Gmail API
      const byUser: Record<string, typeof expiredSnoozes> = {};
      for (const s of expiredSnoozes) {
        byUser[s.userId] = byUser[s.userId] || [];
        byUser[s.userId].push(s);
      }

      for (const userId of Object.keys(byUser)) {
        const list = byUser[userId];
        // Fetch labels once per user
        const allLabels = await this.gmailService.listLabels(userId).catch(() => []);

        for (const snooze of list) {
          try {
            await this.restoreEmail(
              snooze.userId,
              snooze.emailId,
              snooze.previousColumnId || null,
              allLabels,
            );
            logger.log(`✅ Restored snoozed email ${snooze.emailId}`);
          } catch (error) {
            logger.error(`Failed to restore email ${snooze.emailId}:`, error);
          }
        }
      }

    } catch (error) {
      logger.error('Error processing expired snoozes:', error);
    }
  }

  /**
   * Restore email về Kanban column ban đầu
   */
  private async restoreEmail(userId: string, emailId: string, originalColumnId: string, allLabels?: any[]) {
    // Update MongoDB: restore column và clear snooze data
    // NOTE: frontend relies on `kanbanColumnId` as the primary source of truth.
    // Update `kanbanColumnId` and clear `previousColumnId` to reflect the unsnooze.
    const updated = await this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      {
        kanbanColumnId: originalColumnId, // Restore về column ban đầu (primary field)
        previousColumnId: null,
        isSnoozed: false,
        snoozedUntil: null,
        kanbanUpdatedAt: new Date(),
      },
      { new: true },
    );

    // Try to update Gmail labels to reflect unsnooze: remove SNOOZED system label
    // and add the mapped Gmail label for the restored column (if any).
    try {
      const config = await this.kanbanConfigService.getConfig(userId);
      const col = config?.columns?.find((c: any) => c.id === originalColumnId);
      const labelToAddRaw = col?.gmailLabel || null;

      // Use provided allLabels (from parent) when available to avoid extra API calls
      const labels = allLabels || (await this.gmailService.listLabels(userId).catch(() => []));

      const findLabelId = (raw?: string) => {
        if (!raw) return null;
        // Match by exact id
        let found = (labels || []).find((l: any) => l.id === raw);
        if (found) return found.id;
        // Match by name (case-insensitive)
        found = (labels || []).find((l: any) => (l.name || '').toLowerCase() === raw.toLowerCase());
        if (found) return found.id;
        // Try uppercase id for system labels
        found = (labels || []).find((l: any) => l.id === String(raw).toUpperCase());
        return found ? found.id : null;
      };

      const addId = findLabelId(labelToAddRaw);
      // Instead of searching for a 'SNOOZED' label, ensure message is placed back into INBOX
      const inboxLabel = (labels || []).find((l: any) => l.id === 'INBOX' || (l.name || '').toLowerCase() === 'inbox');
      const removeIds: string[] = [];

      // Prepare add list: inbox + column label (if exists)
      const addIds: string[] = [];
      if (inboxLabel && inboxLabel.id) addIds.push(inboxLabel.id);
      if (addId) addIds.push(addId);

      if (addIds.length > 0) {
        await this.gmailService.modifyEmailLabels(userId, emailId, {
          addLabelIds: addIds,
        });

        logger.log(`Updated Gmail labels for ${emailId}: added ${addIds.join(',')}`);
      } else {
        logger.debug(`No matching Gmail labels found for unsnooze of ${emailId}; skipping Gmail modify.`);
      }
      // Emit event so connected clients can update immediately
      try {
        this.eventEmitter.emit('email.restored', {
          userId,
          emailId,
          toColumnId: originalColumnId,
          timestamp: new Date(),
        });
      } catch (emitErr) {
        logger.warn('Failed to emit email.restored event:', emitErr);
      }
    } catch (err) {
      logger.error(`Failed to update Gmail labels while restoring ${emailId}:`, err);
      // Don't throw — restoration should succeed from user's perspective even if Gmail sync fails
    }
    return updated;
  }

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy() {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.log('Snooze scheduler stopped');
    }
  }
}
