import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GmailService } from './gmail.service';
import { AutoIndexingService } from './auto-indexing.service';
import { EmailMetadata } from './schemas/email-metadata.schema';

/**
 * Gmail Sync Service - Week 4 Feature IV
 * 
 * ARCHITECTURE:
 * 1. Fetch emails from Gmail (excluding spam/trash)
 * 2. Save metadata to EmailMetadata (no embedding yet)
 * 3. Assign initial kanbanColumnId
 * 4. Queue emails for AutoIndexingService
 * 
 * DESIGN PRINCIPLES:
 * - Separation of concerns: Gmail fetching vs indexing
 * - Batch processing for performance
 * - Idempotent operations
 * - Progress tracking and error handling
 */

interface SyncOptions {
  userId: string;
  limit?: number; // Max emails to fetch (default: 100)
  forceResync?: boolean; // Re-sync existing emails
}

export interface SyncResult {
  totalFetched: number;
  newEmails: number;
  updatedEmails: number;
  failedEmails: number;
  errors: string[];
}

@Injectable()
export class GmailSyncService {
  private readonly logger = new Logger(GmailSyncService.name);
  // Track in-flight syncs per user to prevent concurrent duplicate full-syncs
  private ongoingSyncs: Map<string, Promise<SyncResult>> = new Map();

  constructor(
    @InjectModel(EmailMetadata.name) private emailMetadataModel: Model<EmailMetadata>,
    private gmailService: GmailService,
    private autoIndexingService: AutoIndexingService,
  ) {}

  /**
   * Sync emails from Gmail to database
   * 
   * @param options - Sync configuration
   * @returns Sync result with statistics
   */
  async syncEmails(options: SyncOptions): Promise<SyncResult> {
    const { userId, limit = 100, forceResync = false } = options;

    // If a sync for this user is already running, return the existing promise
    if (this.ongoingSyncs.has(userId)) {
      this.logger.debug(`🔁 Sync already in progress for user ${userId}, reusing existing operation`);
      return this.ongoingSyncs.get(userId) as Promise<SyncResult>;
    }

    this.logger.log(`🔄 Starting Gmail sync for user ${userId} (limit: ${limit})`);

    const syncPromise = (async (): Promise<SyncResult> => {
      const result: SyncResult = {
        totalFetched: 0,
        newEmails: 0,
        updatedEmails: 0,
        failedEmails: 0,
        errors: [],
      };

      try {
        // STEP 1: Fetch ALL emails from Gmail (excluding trash, spam, drafts, sent)
        this.logger.log(`📥 Fetching all emails from Gmail`);
        const gmailData = await this.gmailService.listAllEmails(userId, limit);

        if (!gmailData?.messages || gmailData.messages.length === 0) {
          this.logger.log(`📭 No emails found`);
          return result;
        }

        result.totalFetched = gmailData.messages.length;
        this.logger.log(`📬 Fetched ${result.totalFetched} emails from Gmail`);

        // STEP 2: Process each email
        const emailIds = gmailData.messages.map(msg => msg.id).filter(Boolean);

        for (const emailId of emailIds) {
          try {
            const syncResult = await this.processSingleEmail(userId, emailId, forceResync);

            if (syncResult.isNew) {
              result.newEmails++;
            } else if (syncResult.isUpdated) {
              result.updatedEmails++;
            }

            // STEP 4: Queue for auto-indexing (always queue for new emails)
            if (syncResult.isNew || syncResult.shouldReindex) {
              await this.autoIndexingService.queueEmail(userId, emailId, 'normal');
            }

          } catch (err) {
            result.failedEmails++;
            const errorMsg = `Failed to process email ${emailId}: ${err.message}`;
            result.errors.push(errorMsg);
            this.logger.error(errorMsg);
          }
        }

        this.logger.log(`✅ Gmail sync completed: ${result.newEmails} new, ${result.updatedEmails} updated, ${result.failedEmails} failed`);

        return result;

      } catch (err) {
        const errorMsg = `Gmail sync failed: ${err.message}`;
        result.errors.push(errorMsg);
        this.logger.error(errorMsg);
        return result;
      } finally {
        // cleanup
        this.ongoingSyncs.delete(userId);
      }
    })();

    this.ongoingSyncs.set(userId, syncPromise);
    return syncPromise;
  }

  /**
   * Check whether a sync for the given user is already in progress
   */
  isSyncInProgress(userId: string): boolean {
    return this.ongoingSyncs.has(userId);
  }

  /**
   * Sync a single email by ID. Uses the existing processSingleEmail logic
   * but exposes it publicly for history-based incremental syncs.
   */
  async syncSingleEmail(userId: string, emailId: string, forceResync = true) {
    // Do not reuse the ongoing full-sync promise for single-email syncs
    try {
      const res = await this.processSingleEmail(userId, emailId, forceResync);

      if (res.isNew || res.shouldReindex) {
        await this.autoIndexingService.queueEmail(userId, emailId, 'normal');
      }

      return res;
    } catch (err) {
      this.logger.error(`syncSingleEmail failed for ${emailId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Process a single email
   */
  private async processSingleEmail(
    userId: string, 
    emailId: string, 
    forceResync: boolean
  ): Promise<{ isNew: boolean; isUpdated: boolean; shouldReindex: boolean }> {
    // Check if email already exists
    const existing = await this.emailMetadataModel.findOne({ userId, emailId }).lean();

    // Skip if exists and not forcing resync
    if (existing && !forceResync) {
      return { isNew: false, isUpdated: false, shouldReindex: false };
    }

    // Fetch full email metadata from Gmail
    const emailData = await this.gmailService.getMessage(userId, emailId);
    
    if (!emailData) {
      throw new Error(`Failed to fetch email data from Gmail`);
    }

    // STEP 3: Determine initial kanban column
    const kanbanColumnId = "inbox"

    // Prepare metadata object
    const metadata = {
      userId,
      emailId,
      threadId: emailData.threadId || emailId,
      kanbanColumnId,
      cachedColumnName: this.getColumnName(kanbanColumnId),
      kanbanUpdatedAt: new Date(),
      // Basic email data for caching
      subject: emailData.subject?.trim() || null,
      from: emailData.from?.trim() || null,
      snippet: emailData.snippet?.trim() || null,
      receivedDate: emailData.date ? new Date(emailData.date) : new Date(),
      labelIds: emailData.labelIds || [],
      // Attachment info
      hasAttachment: (emailData as any).hasAttachment || false,
      attachments: (emailData as any).attachments || [],
      // Sync status
      syncStatus: { state: 'SYNCED' as const, retryCount: 0 },
    };

    if (existing) {
      // Update existing record - use findOneAndUpdate to get explicit result
      try {
        const updated = await this.emailMetadataModel.findOneAndUpdate(
          { userId, emailId },
          {
            ...metadata,
            kanbanUpdatedAt: new Date(), // Always update timestamp
          },
          { new: true }
        ).lean();

      } catch (dbErr) {
        this.logger.error(`❌ Failed to update email ${emailId}: ${dbErr?.message || dbErr}`);
        throw dbErr;
      }

      return {
        isNew: false,
        isUpdated: true,
        shouldReindex: forceResync, // Only reindex if forced
      };
    } else {
      // Create new record
      try {
        const created = await this.emailMetadataModel.create(metadata);
        this.logger.debug(`📝 Created new email: ${emailId} (id: ${created._id})`);
      } catch (dbErr) {
        this.logger.error(`❌ Failed to create email ${emailId}: ${dbErr?.message || dbErr}`);
        throw dbErr;
      }

      return {
        isNew: true,
        isUpdated: false,
        shouldReindex: true, // Always index new emails
      };
    }
  }

  /**
   * Determine initial kanban column based on Gmail labels
   */
  // private determineInitialKanbanColumn(emailData: any): string {
  //   const labelIds = emailData.labelIds || [];

  //   // Priority order: STARRED > IMPORTANT > INBOX
  //   if (labelIds.includes('STARRED')) {
  //     return 'todo'; // Map STARRED to To Do column
  //   }
    
  //   if (labelIds.includes('IMPORTANT')) {
  //     return 'in_progress'; // Map IMPORTANT to In Progress column
  //   }
    
  //   if (labelIds.includes('INBOX')) {
  //     return 'inbox'; // Default to inbox
  //   }

  //   // Fallback for emails without system labels
  //   return 'inbox';
  // }

  /**
   * Get human-readable column name
   */
  private getColumnName(columnId: string): string {
    const columnNames: Record<string, string> = {
      'inbox': 'Inbox',
      'todo': 'To Do',
      'in_progress': 'In Progress',
      'done': 'Done',
    };
    
    return columnNames[columnId] || columnId;
  }

  /**
   * Sync all emails for a user (using listAllEmails which already excludes spam/trash/draft/sent)
   */
  async syncAllLabels(userId: string, limit = 150): Promise<SyncResult> {
    this.logger.log(`🔄 Starting full sync for user ${userId} (limit: ${limit})`);
    
    try {
      // Use syncEmails with larger limit to get all emails at once
      // listAllEmails already excludes spam, trash, drafts, sent
      const result = await this.syncEmails({ 
        userId, 
        limit,
        forceResync: false 
      });

      this.logger.log(`✅ Full sync completed: ${result.newEmails} new, ${result.updatedEmails} updated, ${result.failedEmails} failed`);
      
      return result;
    } catch (err) {
      const errorMsg = `Failed to sync all emails: ${err.message}`;
      this.logger.error(errorMsg);
      
      return {
        totalFetched: 0,
        newEmails: 0,
        updatedEmails: 0,
        failedEmails: 0,
        errors: [errorMsg],
      };
    }
  }

  /**
   * Get sync statistics for a user
   */
  async getSyncStats(userId: string): Promise<any> {
    const stats = await this.emailMetadataModel.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: '$kanbanColumnId',
          count: { $sum: 1 },
          lastUpdated: { $max: '$kanbanUpdatedAt' },
        }
      },
      { $sort: { count: -1 } }
    ]);

    const totalEmails = await this.emailMetadataModel.countDocuments({ userId });
    const indexedEmails = await this.emailMetadataModel.countDocuments({ 
      userId, 
      embedding: { $exists: true, $ne: null, $not: { $size: 0 } }
    });

    return {
      totalEmails,
      indexedEmails,
      indexProgress: totalEmails > 0 ? (indexedEmails / totalEmails * 100).toFixed(1) : '0',
      columnDistribution: stats,
    };
  }
}
