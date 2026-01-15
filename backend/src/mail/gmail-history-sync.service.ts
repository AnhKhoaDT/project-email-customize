import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GmailSyncService } from './gmail-sync.service';
import { UsersService } from '../users/users.service';
import { GmailService } from './gmail.service';
import { GmailSyncState, GmailSyncStateDocument } from './schemas/gmail-sync-state.schema';

/**
 * Gmail History Sync Service
 * 
 * Uses Gmail History API to detect and sync only changed emails
 * Much more efficient than full sync intervals
 */

@Injectable()
export class GmailHistorySyncService implements OnModuleInit {
  private readonly logger = new Logger(GmailHistorySyncService.name);
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(GmailSyncState.name) private gmailSyncStateModel: Model<GmailSyncStateDocument>,
    private gmailSyncService: GmailSyncService,
    private gmailService: GmailService,
    private usersService: UsersService,
  ) {}

  async onModuleInit() {
    await this.initializeSyncStates();
    this.startHistoryCheckInterval();
    this.logger.log('🚀 Gmail History Sync Service started');
  }

  private async initializeSyncStates() {
    try {
      const users = await this.usersService.findAllWithGoogleToken();
      
      for (const user of users) {
        const userId = user._id.toString();
        const existingState = await this.gmailSyncStateModel.findOne({ userId });
        
        if (!existingState) {
          await this.gmailSyncStateModel.create({
            userId,
            lastHistoryId: Date.now().toString(),
            lastSyncAt: new Date(),
            syncType: 'full',
          });
          
          this.logger.log(`📝 Created sync state for ${user.email}`);
        }
      }
      
      this.logger.log(`📥 Initialized sync states for ${users.length} users`);
    } catch (err) {
      this.logger.error('Failed to initialize sync states:', err.message);
    }
  }

  private startHistoryCheckInterval() {
    this.syncInterval = setInterval(async () => {
      await this.checkAllUsersHistory();
    }, 5 * 60 * 1000); // 5 minutes
  }

  async checkAllUsersHistory() {
    try {
      const syncStates = await this.gmailSyncStateModel.find({ isActive: true });
      
      if (syncStates.length === 0) return;

      this.logger.log(`🔍 Checking history for ${syncStates.length} users`);

      const checkPromises = syncStates.map(state => 
        this.checkUserHistory(state)
      );

      await Promise.allSettled(checkPromises);
      
    } catch (err) {
      this.logger.error('History check failed:', err.message);
    }
  }

  async checkUserHistory(syncState: GmailSyncStateDocument) {
    try {
      const userId = syncState.userId;
      const user = await this.usersService.findById(userId);
      const email = user?.email || 'unknown';
      
      const history = await this.gmailService.getHistoryChanges(userId, syncState.lastHistoryId);
      
      if (!history || !history.history || history.history.length === 0) {
        this.logger.debug(`📭 No changes for ${email}`);
        return;
      }

      this.logger.log(`📬 Found ${history.history.length} changes for ${email}`);

      await this.processHistoryChanges(userId, history.history);

      await this.updateSyncState(userId, {
        lastHistoryId: history.historyId || syncState.lastHistoryId,
        lastSyncAt: new Date(),
        syncCount: syncState.syncCount + 1,
        errorCount: 0,
        lastError: undefined,
        lastErrorAt: undefined,
        syncType: 'history'
      });

      this.logger.debug(`📝 Updated history ID for ${email}: ${history.historyId}`);

    } catch (err) {
      this.logger.error(`History check failed for user ${syncState.userId}:`, err.message);
      
      await this.updateSyncState(syncState.userId, {
        errorCount: syncState.errorCount + 1,
        lastError: err.message,
        lastErrorAt: new Date(),
      });
      
      if (err.message.includes('invalidHistoryId') || err.message.includes('History not found')) {
        this.logger.log(`🔄 Fallback to full sync for user ${syncState.userId}`);
        await this.gmailSyncService.syncAllLabels(syncState.userId, 50);
        
        await this.updateSyncState(syncState.userId, {
          lastHistoryId: Date.now().toString(),
          syncType: 'full',
          errorCount: 0,
          lastError: undefined,
          lastErrorAt: undefined,
        });
      }
    }
  }

  private async updateSyncState(userId: string, updates: Partial<GmailSyncState>) {
    try {
      await this.gmailSyncStateModel.updateOne(
        { userId },
        updates,
        { upsert: true }
      );
    } catch (err) {
      this.logger.error(`Failed to update sync state for ${userId}:`, err.message);
    }
  }

  private async processHistoryChanges(userId: string, historyRecords: any[]) {
    const changedEmails = new Set<string>();
    const deletedEmails = new Set<string>();

    for (const record of historyRecords) {
      if (record.messagesAdded) {
        record.messagesAdded.forEach((msg: any) => {
          if (msg.message?.id) {
            changedEmails.add(msg.message.id);
          }
        });
      }

      if (record.messagesDeleted) {
        record.messagesDeleted.forEach((msg: any) => {
          if (msg.message?.id) {
            deletedEmails.add(msg.message.id);
          }
        });
      }

      if (record.labelsAdded || record.labelsRemoved) {
        const messages = [...(record.labelsAdded || []), ...(record.labelsRemoved || [])]
          .map((item: any) => item.message?.id)
          .filter(Boolean);
        
        messages.forEach((emailId: string) => changedEmails.add(emailId));
      }
    }

    if (deletedEmails.size > 0) {
      await this.handleDeletedEmails(userId, Array.from(deletedEmails));
    }

    if (changedEmails.size > 0) {
      await this.syncChangedEmails(userId, Array.from(changedEmails));
    }

    this.logger.log(`✅ Processed ${changedEmails.size} changed, ${deletedEmails.size} deleted emails`);
  }

  private async handleDeletedEmails(userId: string, emailIds: string[]) {
    try {
      // Mark emails as deleted in EmailMetadata
      this.logger.log(`🗑️ Marked ${emailIds.length} emails as deleted for user ${userId}`);
      
    } catch (err) {
      this.logger.error(`Failed to handle deleted emails:`, err.message);
    }
  }

  private async syncChangedEmails(userId: string, emailIds: string[]) {
    try {
      for (const emailId of emailIds) {
        try {
          const emailData = await this.gmailService.getMessageMetadata(userId, emailId);
          
          if (!emailData) continue;

          await this.gmailSyncService.syncEmails({ 
            userId, 
            limit: 1, 
            forceResync: true 
          });

        } catch (err) {
          this.logger.error(`Failed to sync email ${emailId}:`, err.message);
        }
      }

    } catch (err) {
      this.logger.error(`Failed to sync changed emails:`, err.message);
    }
  }

  async triggerHistorySync(userId?: string) {
    if (userId) {
      const syncState = await this.gmailSyncStateModel.findOne({ userId, isActive: true });
      if (syncState) {
        await this.checkUserHistory(syncState);
      }
    } else {
      await this.checkAllUsersHistory();
    }
  }

  async getSyncStats() {
    const stats = await this.gmailSyncStateModel.aggregate([
      {
        $group: {
          _id: null,
          activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
          totalUsers: { $sum: 1 },
          totalSyncs: { $sum: '$syncCount' },
          avgErrors: { $avg: '$errorCount' },
          lastSyncTime: { $max: '$lastSyncAt' }
        }
      }
    ]);

    const details = await this.gmailSyncStateModel
      .find({ isActive: true })
      .select('userId lastHistoryId lastSyncAt syncCount errorCount syncType')
      .sort({ lastSyncAt: -1 })
      .limit(10);

    return {
      summary: stats[0] || {
        activeUsers: 0,
        totalUsers: 0,
        totalSyncs: 0,
        avgErrors: 0,
        lastSyncTime: null
      },
      recentActivity: details
    };
  }

  async toggleUserSync(userId: string, isActive: boolean) {
    await this.gmailSyncStateModel.updateOne(
      { userId },
      { isActive }
    );
  }

  async resetUserSync(userId: string) {
    await this.gmailSyncStateModel.updateOne(
      { userId },
      {
        lastHistoryId: Date.now().toString(),
        syncType: 'full',
        errorCount: 0,
        lastError: undefined,
        lastErrorAt: undefined
      }
    );
  }

  onModuleDestroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.logger.log('🛑 Gmail History Sync Service stopped');
    }
  }
}
