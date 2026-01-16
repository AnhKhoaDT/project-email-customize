import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import pLimit from 'p-limit';
import { GmailService } from './gmail.service';
import { GmailSyncService } from './gmail-sync.service'; // Import the main sync service
import { User } from '../users/schemas/user.schema'; // Fixed import path
import { EmailMetadata } from './schemas/email-metadata.schema';

@Injectable()
export class GmailHistorySyncService {
  private readonly logger = new Logger(GmailHistorySyncService.name);
  private readonly CONCURRENCY_LIMIT = 5;
  // Per-user interval handles for scheduled incremental syncs (started at login)
  private userIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private gmailService: GmailService,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(EmailMetadata.name) private emailMetadataModel: Model<EmailMetadata>,
    // Inject GmailSyncService to reuse the "save to DB" logic
    // Use forwardRef if there's a circular dependency, otherwise standard injection is fine
    @Inject(forwardRef(() => GmailSyncService))
    private gmailSyncService: GmailSyncService,
  ) { }

  async syncUserEmails(userId: string) {
    const user = await this.userModel.findById(userId);

    // Case 1: New user (no historyId) -> Run initial seed
    if (!user || !user.lastHistoryId) {
      return this.handleSmartRecovery(user, "INITIAL_SEED");
    }

    try {
      // Case 2: Incremental Sync
      // FIXED: Typing the response to avoid confusion
      const historyRes = await this.gmailService.getHistoryChanges(userId, user.lastHistoryId);
      const history = historyRes.history || [];

      // FIXED BUG 1: Access the correct property 'newHistoryId'
      const newHistoryId = historyRes.newHistoryId || user.lastHistoryId;

      if (!history || history.length === 0) {
        await this.updateUserHistoryId(userId, newHistoryId);
        return;
      }

      await this.processHistoryItems(userId, history);
      await this.updateUserHistoryId(userId, newHistoryId);

    } catch (error) {
      // ✅ SỬA ĐOẠN NÀY: Mở rộng điều kiện bắt lỗi
      const isHistoryInvalid =
        error.code === 410 ||
        error.response?.status === 410 ||
        error.code === 404 || // Google thường trả 404 cho historyId sai
        error.message?.includes('Invalid history ID') || // Bắt message từ GmailService
        error.message === 'HISTORY_EXPIRED';

      if (isHistoryInvalid) {
        this.logger.warn(`User ${userId} historyId is invalid/expired. Triggering Smart Recovery.`);
        // Tự động sửa lỗi bằng cách chạy Smart Recovery
        await this.handleSmartRecovery(user, "HISTORY_EXPIRED");
      } else {
        // Các lỗi khác (Mạng, 500...) thì mới log error
        this.logger.error(`Sync failed for user ${userId}: ${error.message}`, error.stack);
      }
    }
  }

  /**
   * Initialize or refresh a user's stored historyId from Gmail profile.
   * Called after OAuth to ensure a valid starting anchor for incremental sync.
   */
  async initializeUserHistory(userId: string): Promise<void> {
    try {
      const historyId = await this.gmailService.getProfileHistoryId(userId);
      await this.updateUserHistoryId(userId, historyId);
      this.logger.log(`Initialized historyId for user ${userId}: ${historyId}`);
    } catch (err) {
      this.logger.warn(`Failed to initialize historyId for ${userId}: ${err?.message || err}`);
    }
  }

  /**
   * Start a per-user scheduler that runs incremental sync every 5 minutes
   * Runs an immediate sync then schedules repeats every 5 minutes.
   */
  startUserScheduler(userId: string) {
    if (this.userIntervals.has(userId)) return; // already running

    // Run immediately (do not await)
    this.syncUserEmails(userId).catch(err => this.logger.error(`Initial incremental sync failed for ${userId}: ${err?.message || err}`));

    const handle = setInterval(() => {
      this.syncUserEmails(userId).catch(err => this.logger.error(`Scheduled incremental sync failed for ${userId}: ${err?.message || err}`));
    }, 5 * 60 * 1000);

    this.userIntervals.set(userId, handle);
    this.logger.log(`Started incremental scheduler for user ${userId}`);
  }

  /** Stop the per-user scheduler */
  stopUserScheduler(userId: string) {
    const handle = this.userIntervals.get(userId);
    if (!handle) return;
    clearInterval(handle);
    this.userIntervals.delete(userId);
    this.logger.log(`Stopped incremental scheduler for user ${userId}`);
  }

  private async processHistoryItems(userId: string, historyItems: any[]) {
    const limit = pLimit(this.CONCURRENCY_LIMIT);

    const messagesToAdd = new Set<string>();
    const messagesToDelete = new Set<string>();

    for (const item of historyItems) {
      if (item.messagesAdded) {
        item.messagesAdded.forEach((m: any) => messagesToAdd.add(m.message.id));
      }
      if (item.messagesDeleted) {
        item.messagesDeleted.forEach((m: any) => messagesToDelete.add(m.message.id));
      }
    }

    // 1. Handle Deletions
    if (messagesToDelete.size > 0) {
      await this.handleDeletedEmails(userId, Array.from(messagesToDelete));
    }

    // 2. Handle Additions/Updates
    const promises = Array.from(messagesToAdd).map((msgId) =>
      limit(() => this.syncSingleEmailSafe(userId, msgId))
    );

    await Promise.all(promises);
  }

  // FIXED BUG 2: Implement the actual sync logic
  private async syncSingleEmailSafe(userId: string, messageId: string) {
    try {
      // Reuse the existing logic from your GmailSyncService
      // forceResync=true ensures we update the email if it changed
      await this.gmailSyncService.syncSingleEmail(userId, messageId, true);
    } catch (error) {
      if (error.code === 404) {
        // Email was added then immediately deleted
        await this.emailMetadataModel.deleteOne({ userId, emailId: messageId });
      } else {
        this.logger.error(`Failed to sync email ${messageId}`, error);
      }
    }
  }

  private async handleSmartRecovery(user: any, reason: string) {
    this.logger.log(`Starting Smart Recovery for ${user._id} due to ${reason}`);

    try {
      // 1. Get new baseline historyId
      const currentHistoryId = await this.gmailService.getProfileHistoryId(user._id);

      // 2. Backfill recent 100 emails to patch gaps
      const recentPage = await this.gmailService.listAllEmails(user._id, 100);
      const recentEmails = recentPage?.messages || [];

      const limit = pLimit(this.CONCURRENCY_LIMIT);
      const promises = recentEmails.map((msg: any) =>
        limit(() => this.syncSingleEmailSafe(user._id, msg.id))
      );
      await Promise.all(promises);

      // 3. Reset anchor
      await this.updateUserHistoryId(user._id, currentHistoryId);

      this.logger.log(`Smart Recovery completed. New historyId: ${currentHistoryId}`);

    } catch (error) {
      this.logger.error(`Smart Recovery failed for ${user._id}`, error);
    }
  }

  private async updateUserHistoryId(userId: string, historyId: string) {
    await this.userModel.updateOne({ _id: userId }, { lastHistoryId: historyId });
  }

  private async handleDeletedEmails(userId: string, messageIds: string[]) {
    await this.emailMetadataModel.deleteMany({
      userId,
      emailId: { $in: messageIds }
    });
    this.logger.log(`Deleted ${messageIds.length} emails from DB`);
  }
}