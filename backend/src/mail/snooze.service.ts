import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as cron from 'node-cron';
import { EmailMetadata, EmailMetadataDocument } from './schemas/email-metadata.schema';
import { GmailService } from './gmail.service';

const logger = new Logger('SnoozeService');

@Injectable()
export class SnoozeService implements OnModuleInit {
  private cronJob: cron.ScheduledTask;

  constructor(
    @InjectModel(EmailMetadata.name)
    private emailMetadataModel: Model<EmailMetadataDocument>,
    private gmailService: GmailService,
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
    threadId: string,
    snoozedUntil: Date,
  ) {
    try {
      // BƯỚC 1: Lấy current status từ DB (email phải đã trong Kanban)
      const metadata = await this.emailMetadataModel.findOne({ userId, emailId });
      
      if (!metadata) {
        throw new Error('Email not in Kanban. Only Kanban emails can be snoozed.');
      }

      const originalStatus = metadata.status; // TODO, IN_PROGRESS, hoặc DONE

      // BƯỚC 2: Lưu snooze data vào MongoDB
      await this.emailMetadataModel.findOneAndUpdate(
        { userId, emailId },
        {
          snoozedUntil,
          originalStatus,
          isSnoozed: true,
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

      await this.restoreEmail(userId, emailId, metadata.originalStatus);

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

      for (const snooze of expiredSnoozes) {
        try {
          await this.restoreEmail(
            snooze.userId,
            snooze.emailId,
            snooze.originalStatus || 'TODO'
          );
          logger.log(`✅ Restored snoozed email ${snooze.emailId}`);
        } catch (error) {
          logger.error(`Failed to restore email ${snooze.emailId}:`, error);
        }
      }

    } catch (error) {
      logger.error('Error processing expired snoozes:', error);
    }
  }

  /**
   * Restore email về Kanban status ban đầu
   */
  private async restoreEmail(userId: string, emailId: string, originalStatus: string) {
    // Update MongoDB: restore status và clear snooze data
    await this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      {
        status: originalStatus, // Restore về TODO/IN_PROGRESS/DONE
        isSnoozed: false,
        snoozedUntil: null,
        originalStatus: null,
        statusUpdatedAt: new Date(),
      }
    );
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
