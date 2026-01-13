import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmailMetadata } from './schemas/email-metadata.schema';
import { SemanticSearchService } from './semantic-search.service';

/**
 * Auto-Indexing Service
 * 
 * Automatically indexes emails for semantic search in the background.
 * 
 * KEY FEATURES:
 * - ✅ Idempotency: Checks if email already has embedding before indexing
 * - ✅ Rate Limiting: Controls indexing speed to avoid API quota limits
 * - ✅ Queue-based: Uses in-memory queue to batch process emails
 * - ✅ Silent Failure: Errors don't crash the app, just log warnings
 * - ✅ HTML Stripping: Pre-processes email content before embedding
 * 
 * DESIGN DECISIONS:
 * - In-memory queue (no Redis needed for MVP)
 * - Process queue every 5 seconds
 * - Max 10 emails per batch to avoid rate limits
 * - Skip emails that already have embeddings (idempotency)
 */

interface IndexingJob {
  userId: string;
  emailId: string;
  priority: 'high' | 'normal'; // high = user just logged in, normal = background
  addedAt: Date;
}

@Injectable()
export class AutoIndexingService {
  private readonly logger = new Logger(AutoIndexingService.name);
  
  // In-memory queue
  private indexingQueue: Map<string, IndexingJob> = new Map(); // key = emailId to prevent duplicates
  
  // Processing state
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  
  // Rate limiting config
  private readonly BATCH_SIZE = 10; // Process 10 emails at a time
  private readonly PROCESS_INTERVAL_MS = 5000; // Every 5 seconds
  private readonly MAX_QUEUE_SIZE = 1000; // Prevent memory overflow
  
  // Statistics
  private stats = {
    totalQueued: 0,
    totalProcessed: 0,
    totalSkipped: 0,
    totalFailed: 0,
  };

  constructor(
    @InjectModel(EmailMetadata.name) private emailMetadataModel: Model<EmailMetadata>,
    private semanticSearchService: SemanticSearchService,
  ) {
    // Start background processing loop
    this.startProcessingLoop();
  }

  /**
   * Start background processing loop
   */
  private startProcessingLoop(): void {
    this.logger.log('🚀 Starting auto-indexing background service...');
    
    this.processingInterval = setInterval(() => {
      this.processQueue().catch(err => {
        this.logger.error('Queue processing error:', err.message);
      });
    }, this.PROCESS_INTERVAL_MS);
  }

  /**
   * Stop background processing (for graceful shutdown)
   */
  onModuleDestroy(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.logger.log('Auto-indexing service stopped');
    }
  }

  /**
   * Add email to indexing queue (idempotent - won't add duplicates)
   * 
   * @param userId - User ID
   * @param emailId - Email ID
   * @param priority - 'high' for login emails, 'normal' for background
   */
  async queueEmail(userId: string, emailId: string, priority: 'high' | 'normal' = 'normal'): Promise<void> {
    // Check queue size limit
    if (this.indexingQueue.size >= this.MAX_QUEUE_SIZE) {
      this.logger.warn(`Queue full (${this.MAX_QUEUE_SIZE}), skipping email ${emailId}`);
      return;
    }

    // Idempotency check 1: Already in queue?
    if (this.indexingQueue.has(emailId)) {
      return; // Skip, already queued
    }

    // Idempotency check 2: Already has embedding in DB?
    try {
      const existing = await this.emailMetadataModel.findOne(
        { userId, emailId },
        { embedding: 1 } // Only fetch embedding field
      ).lean();

      if (existing?.embedding && existing.embedding.length > 0) {
        // Already indexed, skip
        this.stats.totalSkipped++;
        return;
      }
    } catch (err) {
      // If check fails, queue it anyway (better to index twice than miss)
      this.logger.warn(`Failed to check existing embedding for ${emailId}, queuing anyway`);
    }

    // Add to queue
    this.indexingQueue.set(emailId, {
      userId,
      emailId,
      priority,
      addedAt: new Date(),
    });

    this.stats.totalQueued++;
  }

  /**
   * Queue multiple emails at once
   * 
   * @param userId - User ID
   * @param emailIds - Array of email IDs
   * @param priority - Priority level
   */
  async queueBatch(userId: string, emailIds: string[], priority: 'high' | 'normal' = 'normal'): Promise<void> {
    this.logger.log(`Queueing ${emailIds.length} emails for user ${userId} (priority: ${priority})`);
    
    // Queue in parallel (fast)
    await Promise.all(
      emailIds.map(emailId => this.queueEmail(userId, emailId, priority))
    );
  }

  /**
   * Process queue - called by interval
   */
  private async processQueue(): Promise<void> {
    // Skip if already processing (prevent concurrent processing)
    if (this.isProcessing) {
      return;
    }

    // Skip if queue is empty
    if (this.indexingQueue.size === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get next batch (prioritize 'high' priority jobs)
      const batch = this.getNextBatch(this.BATCH_SIZE);
      
      if (batch.length === 0) {
        return;
      }

      this.logger.log(`📦 Processing batch of ${batch.length} emails...`);

      // Process batch in parallel (but with error isolation)
      const results = await Promise.allSettled(
        batch.map(job => this.indexEmail(job))
      );

      // Count results
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      this.stats.totalProcessed += succeeded;
      this.stats.totalFailed += failed;

      this.logger.log(`✅ Batch complete: ${succeeded} success, ${failed} failed. Queue size: ${this.indexingQueue.size}`);

    } catch (err) {
      this.logger.error('Fatal queue processing error:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get next batch from queue (prioritize high priority)
   */
  private getNextBatch(size: number): IndexingJob[] {
    const jobs = Array.from(this.indexingQueue.values());
    
    // Sort: high priority first, then by time added
    jobs.sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (a.priority !== 'high' && b.priority === 'high') return 1;
      return a.addedAt.getTime() - b.addedAt.getTime();
    });

    // Take first N jobs
    const batch = jobs.slice(0, size);

    // Remove from queue
    batch.forEach(job => this.indexingQueue.delete(job.emailId));

    return batch;
  }

  /**
   * Index a single email (with error handling)
   */
  private async indexEmail(job: IndexingJob): Promise<void> {
    try {
      const result = await this.semanticSearchService.storeEmailEmbedding(
        job.userId,
        job.emailId
      );

      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }

      this.logger.debug(`✅ Indexed email ${job.emailId}`);

    } catch (err) {
      // Silent failure - log but don't crash
      this.logger.warn(`⚠️  Failed to index email ${job.emailId}: ${err.message}`);
      throw err; // Re-throw for Promise.allSettled to catch
    }
  }

  /**
   * Get current queue statistics
   */
  getStats(): any {
    return {
      queueSize: this.indexingQueue.size,
      isProcessing: this.isProcessing,
      stats: this.stats,
    };
  }

  /**
   * Clear queue (for testing or emergency)
   */
  clearQueue(): void {
    this.indexingQueue.clear();
    this.logger.warn('Queue cleared manually');
  }
}
