import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmailMetadata } from './schemas/email-metadata.schema';
import { GmailService } from './gmail.service';
import { AiService } from '../ai/ai.service';

/**
 * Semantic Search Service - Week 4 Feature I
 * 
 * Implements vector-based semantic search using embeddings.
 * Uses Gemini API to generate embeddings for emails and queries.
 * Finds conceptually related emails, not just exact text matches.
 */

interface EmbeddingCache {
  emailId: string;
  embedding: number[];
  text: string;
  createdAt: Date;
}

@Injectable()
export class SemanticSearchService {
  constructor(
    @InjectModel(EmailMetadata.name) private emailMetadataModel: Model<EmailMetadata>,
    private gmailService: GmailService,
    private aiService: AiService,
  ) {}

  /**
   * Generate embedding vector for text using Gemini API
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Use Gemini API for embeddings
      const embedding = await this.aiService.generateEmbedding(text);
      return embedding;
    } catch (err) {
      throw new Error(`Failed to generate embedding: ${err.message}`);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   * Returns value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Store or update embedding for an email with retry logic
   * @param userId - User ID
   * @param emailId - Email ID
   * @param retryCount - Current retry attempt (default 0)
   * @returns Success status
   */
  async storeEmailEmbedding(
    userId: string, 
    emailId: string, 
    retryCount: number = 0
  ): Promise<{ success: boolean; emailId: string; error?: string }> {
    const MAX_RETRIES = 2;
    const RETRY_DELAY = 1000; // 1 second

    try {
      // Check if embedding already exists
      const existing = await this.emailMetadataModel.findOne({ userId, emailId });
      
      if (existing?.embedding && existing.embedding.length > 0) {
        // Embedding already exists, skip
        return { success: true, emailId };
      }

      // Fetch full email content
      const email = await this.gmailService.getMessage(userId, emailId);
      
      // Combine from, subject and body for embedding (include sender for better matching)
      const textForEmbedding = `From: ${email.from || ''}\nSubject: ${email.subject || ''}\n${email.textBody || email.snippet || ''}`.trim();
      
      if (!textForEmbedding || textForEmbedding === 'From:\nSubject:') {
        console.log(`[Indexing] Skipped empty email ${emailId}`);
        return { success: true, emailId }; // Consider empty as success (skip)
      }

      // Generate embedding with potential retry
      const embedding = await this.generateEmbedding(textForEmbedding);

      // Store in database
      if (existing) {
        // Update existing record
        existing.embedding = embedding;
        existing.embeddingText = textForEmbedding;
        existing.embeddingGeneratedAt = new Date();
        await existing.save();
      } else {
        // Create new record (status not set - only for indexing)
        await this.emailMetadataModel.create({
          userId,
          emailId,
          threadId: email.threadId,
          embedding,
          embeddingText: textForEmbedding,
          embeddingGeneratedAt: new Date(),
          // No status field - this email is not in Kanban
        });
      }

      console.log(`[Indexing] ✅ Successfully indexed email ${emailId}`);
      return { success: true, emailId };

    } catch (err) {
      const errorMsg = err?.message || 'Unknown error';
      
      // Check if we should retry
      if (retryCount < MAX_RETRIES && this.isRetryableError(err)) {
        console.warn(`[Indexing] ⚠️  Failed to index ${emailId} (attempt ${retryCount + 1}/${MAX_RETRIES + 1}): ${errorMsg}. Retrying...`);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
        
        // Retry
        return this.storeEmailEmbedding(userId, emailId, retryCount + 1);
      }

      // Max retries reached or non-retryable error
      console.error(`[Indexing] ❌ Failed to index email ${emailId} after ${retryCount + 1} attempts: ${errorMsg}`);
      return { success: false, emailId, error: errorMsg };
    }
  }

  /**
   * Check if error is retryable (network issues, rate limits, etc.)
   */
  private isRetryableError(error: any): boolean {
    const errorMsg = error?.message?.toLowerCase() || '';
    const statusCode = error?.status || error?.statusCode || 0;
    
    // Retry on network errors, timeouts, and rate limits
    return (
      statusCode === 429 ||  // Rate limit
      statusCode === 503 ||  // Service unavailable
      statusCode === 504 ||  // Gateway timeout
      errorMsg.includes('timeout') ||
      errorMsg.includes('network') ||
      errorMsg.includes('econnreset') ||
      errorMsg.includes('quota')
    );
  }

  /**
   * Batch process embeddings for multiple emails with progress tracking
   * @returns Statistics about success/failure
   */
  async batchGenerateEmbeddings(
    userId: string, 
    emailIds: string[]
  ): Promise<{ success: number; failed: number; failedEmails: string[] }> {
    console.log(`[Indexing] Starting batch indexing for ${emailIds.length} emails...`);
    
    const results = await Promise.all(
      emailIds.map(emailId => this.storeEmailEmbedding(userId, emailId))
    );

    // Count successes and failures
    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const failedEmails = results
      .filter(r => !r.success)
      .map(r => `${r.emailId} (${r.error})`);

    // Log summary
    console.log(`[Indexing] ✅ Batch complete: ${success} success, ${failed} failed`);
    if (failed > 0) {
      console.warn(`[Indexing] ⚠️  Failed emails:`, failedEmails);
    }

    return { success, failed, failedEmails };
  }

  /**
   * Perform semantic search using vector similarity
   * @param userId - User ID for authentication
   * @param query - Search query string
   * @param options - Search options (limit, threshold)
   * @returns Ranked list of semantically similar emails
   */
  async semanticSearch(
    userId: string,
    query: string,
    options: { limit?: number; threshold?: number } = {}
  ): Promise<any> {
    try {
      const { limit = 20, threshold = 0.5 } = options;

      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);

      // Fetch all emails with embeddings from database
      const emailsWithEmbeddings = await this.emailMetadataModel
        .find({ 
          userId, 
          embedding: { $exists: true, $ne: null, $not: { $size: 0 } }
        })
        .select('emailId threadId embedding embeddingText')
        .lean();

      // Auto-index if no embeddings found
      if (emailsWithEmbeddings.length === 0) {
        console.log('[SemanticSearch] No embeddings found. Auto-indexing recent emails...');
        
        // Fetch recent emails from Gmail
        const inboxData = await this.gmailService.listMessagesInLabel(userId, 'INBOX', 200);
        
        if (inboxData?.messages && inboxData.messages.length > 0) {
          const emailIds = inboxData.messages.map(m => m.id).filter(Boolean);
          
          console.log(`[SemanticSearch] Auto-indexing ${emailIds.length} emails in background...`);
          
          // Index in background (don't wait)
          this.batchGenerateEmbeddings(userId, emailIds).catch(err => {
            console.error('[SemanticSearch] Background indexing failed:', err);
          });
        }
        
        return {
          status: 200,
          data: {
            query,
            results: [],
            totalResults: 0,
            message: 'Indexing emails in background. Please try again in a few seconds.',
          },
        };
      }

      // Calculate similarity scores
      const scoredEmails = [];

      for (const emailDoc of emailsWithEmbeddings) {
        try {
          const similarity = this.cosineSimilarity(queryEmbedding, emailDoc.embedding);

          // Only include emails above similarity threshold
          if (similarity >= threshold) {
            // Fetch full email details from Gmail
            const emailDetails = await this.gmailService.getMessage(userId, emailDoc.emailId);
            
            scoredEmails.push({
              ...emailDetails,
              similarityScore: similarity,
              matchedText: emailDoc.embeddingText,
            });
          }
        } catch (err) {
          console.error(`Error processing email ${emailDoc.emailId}:`, err.message);
        }
      }

      // Sort by similarity score (highest first)
      scoredEmails.sort((a, b) => b.similarityScore - a.similarityScore);

      // Limit results
      const results = scoredEmails.slice(0, limit);

      return {
        status: 200,
        data: {
          query,
          results,
          totalResults: scoredEmails.length,
          searchedEmails: emailsWithEmbeddings.length,
        },
      };
    } catch (err) {
      throw new Error(`Semantic search failed: ${err.message}`);
    }
  }

  /**
   * Generate embeddings for all inbox emails (background job)
   */
  async indexAllEmails(userId: string, options: { limit?: number } = {}): Promise<any> {
    try {
      const { limit = 100 } = options;

      console.log(`[Indexing] Fetching up to ${limit} emails from inbox...`);

      // Fetch inbox emails
      const inboxData = await this.gmailService.listMessagesInLabel(userId, 'INBOX', limit);
      
      if (!inboxData?.messages || inboxData.messages.length === 0) {
        return {
          status: 200,
          message: 'No emails to index',
          data: {
            total: 0,
            success: 0,
            failed: 0,
            failedEmails: [],
          },
        };
      }

      const emailIds = inboxData.messages.map(m => m.id).filter(Boolean);
      console.log(`[Indexing] Found ${emailIds.length} emails to process`);

      // Batch process embeddings with tracking
      const stats = await this.batchGenerateEmbeddings(userId, emailIds);

      // Build response message
      let message = `Successfully indexed ${stats.success}/${emailIds.length} emails`;
      if (stats.failed > 0) {
        message += `. ${stats.failed} failed (check logs for details)`;
      }

      return {
        status: 200,
        message,
        data: {
          total: emailIds.length,
          success: stats.success,
          failed: stats.failed,
          failedEmails: stats.failedEmails,
        },
      };
    } catch (err) {
      console.error('[Indexing] ❌ Critical error during indexing:', err.message);
      throw new Error(`Failed to index emails: ${err.message}`);
    }
  }

  /**
   * Get indexing statistics
   */
  async getIndexStats(userId: string): Promise<any> {
    try {
      const totalEmails = await this.emailMetadataModel.countDocuments({ userId });
      const indexedEmails = await this.emailMetadataModel.countDocuments({ 
        userId, 
        embedding: { $exists: true, $ne: null, $not: { $size: 0 } }
      });

      return {
        status: 200,
        data: {
          totalEmails,
          indexedEmails,
          pendingIndexing: totalEmails - indexedEmails,
          indexingProgress: totalEmails > 0 ? (indexedEmails / totalEmails) * 100 : 0,
        },
      };
    } catch (err) {
      throw new Error(`Failed to get index stats: ${err.message}`);
    }
  }
}
