import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmailMovedEvent } from './dto/move-email.dto';
import { GmailService } from './gmail.service';
import { EmailMetadata } from './schemas/email-metadata.schema';
import { KanbanConfig } from './schemas/kanban-config.schema';

/**
 * Gmail Sync Listener - Week 4 Feature III
 * 
 * Listens to 'email.moved' events and syncs with Gmail API asynchronously.
 * 
 * REFINEMENT:
 * - Uses NestJS EventEmitter2 (no Redis/BullMQ needed)
 * - Runs in-memory, same process
 * - Auto-retry with exponential backoff
 * - Logs errors to DB for manual intervention
 * - Detects deleted Gmail labels and marks columns
 */

@Injectable()
export class GmailSyncListener {
  private readonly logger = new Logger(GmailSyncListener.name);
  private readonly MAX_RETRIES = 3;
  private readonly BASE_RETRY_DELAY_MS = 2000; // 2 seconds

  constructor(
    @InjectModel(EmailMetadata.name) private emailMetadataModel: Model<EmailMetadata>,
    @InjectModel(KanbanConfig.name) private kanbanConfigModel: Model<KanbanConfig>,
    private gmailService: GmailService,
  ) {}

  /**
   * Handle email.moved event
   * Syncs label changes with Gmail API
   */
  @OnEvent('email.moved', { async: true })
  async handleEmailMoved(event: EmailMovedEvent): Promise<void> {
    this.logger.log(`Processing email.moved event for ${event.emailId}`);

    await this.syncWithRetry(event, 0);
  }

  /**
   * Sync with Gmail API with exponential backoff retry
   */
  private async syncWithRetry(event: EmailMovedEvent, attempt: number): Promise<void> {
    try {
      // ============================================
      // GMAIL API CALL: Modify Labels
      // ============================================
      this.logger.debug(`Attempt ${attempt + 1}/${this.MAX_RETRIES} for ${event.emailId}`);

      await this.gmailService.modifyEmailLabels(
        event.userId,
        event.emailId,
        {
          addLabelIds: event.labelsToAdd,
          removeLabelIds: event.labelsToRemove,
        }
      );

      // ============================================
      // SUCCESS: Update metadata sync status
      // ============================================
      await this.emailMetadataModel.findByIdAndUpdate(event.metadataId, {
        syncStatus: {
          state: 'SYNCED',
          lastAttempt: new Date(),
          retryCount: attempt,
          errorMessage: null,
        },
      });

      this.logger.log(`✅ Email ${event.emailId} synced successfully`);

    } catch (error) {
      this.logger.error(`❌ Gmail sync failed for ${event.emailId}: ${error.message}`);

      // ============================================
      // DETECT LABEL NOT FOUND ERROR
      // ============================================
      const isLabelNotFoundError = this.isLabelError(error);
      
      if (isLabelNotFoundError) {
        this.logger.error(`🏷️ Gmail label not found for ${event.emailId}. Marking column as error.`);
        
        // Mark column as having label error
        await this.markColumnLabelError(event.userId, event.toColumnId, error.message);
        
        // Mark email metadata as error (no retry)
        await this.emailMetadataModel.findByIdAndUpdate(event.metadataId, {
          syncStatus: {
            state: 'ERROR',
            lastAttempt: new Date(),
            retryCount: 0,
            errorMessage: `Gmail label not found: ${error.message}`,
          },
        });
        
        return; // Stop retrying for label errors
      }

      const isLastAttempt = (attempt >= this.MAX_RETRIES - 1);

      if (isLastAttempt) {
        // ============================================
        // FINAL FAILURE: Mark as error in DB
        // ============================================
        await this.emailMetadataModel.findByIdAndUpdate(event.metadataId, {
          syncStatus: {
            state: 'ERROR',
            lastAttempt: new Date(),
            retryCount: attempt + 1,
            errorMessage: error.message,
          },
        });

        this.logger.error(`🚨 Email ${event.emailId} sync failed after ${this.MAX_RETRIES} attempts`);
      } else {
        // ============================================
        // RETRY: Exponential backoff
        // ============================================
        const delay = this.BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        this.logger.warn(`⏳ Retrying in ${delay}ms...`);

        await this.delay(delay);
        await this.syncWithRetry(event, attempt + 1);
      }
    }
  }

  /**
   * Utility: Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Manual retry for failed syncs
   * Can be called from admin panel or cron job
   */
  async retryFailedSyncs(userId: string): Promise<number> {
    const failedEmails = await this.emailMetadataModel.find({
      userId,
      'syncStatus.state': 'ERROR',
    });

    this.logger.log(`Found ${failedEmails.length} failed syncs for user ${userId}`);

    for (const email of failedEmails) {
      // Recreate event and retry
      const event: EmailMovedEvent = {
        userId: email.userId,
        emailId: email.emailId,
        fromColumnId: email.previousColumnId || 'inbox',
        toColumnId: email.cachedColumnId || 'unknown',
        labelsToAdd: email.labelIds,
        labelsToRemove: [],
        metadataId: email._id.toString(),
        timestamp: new Date(),
      };

      await this.syncWithRetry(event, 0);
    }

    return failedEmails.length;
  }

  /**
   * Detect if error is related to Gmail label not found
   * Common error codes: 404, "Label not found", "invalidLabelId"
   */
  private isLabelError(error: any): boolean {
    const errorStr = error?.message?.toLowerCase() || '';
    const errorCode = error?.code;
    
    return (
      errorCode === 404 ||
      errorStr.includes('label not found') ||
      errorStr.includes('invalid label') ||
      errorStr.includes('invalidlabelid') ||
      errorStr.includes('label does not exist')
    );
  }

  /**
   * Mark Kanban column as having label error
   */
  private async markColumnLabelError(
    userId: string, 
    columnId: string, 
    errorMessage: string
  ): Promise<void> {
    try {
      const config = await this.kanbanConfigModel.findOne({ userId });
      
      if (!config) {
        this.logger.warn(`Kanban config not found for user ${userId}`);
        return;
      }

      const column = config.columns.find(c => c.id === columnId);
      
      if (!column) {
        this.logger.warn(`Column ${columnId} not found in config`);
        return;
      }

      // Update column error state
      column.hasLabelError = true;
      column.labelErrorMessage = errorMessage;
      column.labelErrorDetectedAt = new Date();

      await config.save();

      this.logger.log(`✅ Marked column ${columnId} as having label error`);
    } catch (err) {
      this.logger.error(`Failed to mark column error: ${err.message}`);
    }
  }
}
