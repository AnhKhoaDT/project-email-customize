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
   * Store or update embedding for an email
   */
  async storeEmailEmbedding(userId: string, emailId: string): Promise<void> {
    try {
      // Check if embedding already exists
      const existing = await this.emailMetadataModel.findOne({ userId, emailId });
      
      if (existing?.embedding && existing.embedding.length > 0) {
        // Embedding already exists, skip
        return;
      }

      // Fetch full email content
      const email = await this.gmailService.getMessage(userId, emailId);
      
      // Combine subject and body for embedding
      const textForEmbedding = `${email.subject || ''} ${email.textBody || email.snippet || ''}`.trim();
      
      if (!textForEmbedding) {
        return; // Skip empty emails
      }

      // Generate embedding
      const embedding = await this.generateEmbedding(textForEmbedding);

      // Store in database
      if (existing) {
        // Update existing record
        existing.embedding = embedding;
        existing.embeddingText = textForEmbedding;
        await existing.save();
      } else {
        // Create new record
        await this.emailMetadataModel.create({
          userId,
          emailId,
          threadId: email.threadId,
          embedding,
          embeddingText: textForEmbedding,
          status: 'INBOX', // Default status
        });
      }
    } catch (err) {
      console.error(`Failed to store embedding for email ${emailId}:`, err.message);
      // Don't throw - allow batch processing to continue
    }
  }

  /**
   * Batch process embeddings for multiple emails
   */
  async batchGenerateEmbeddings(userId: string, emailIds: string[]): Promise<void> {
    const promises = emailIds.map(emailId => this.storeEmailEmbedding(userId, emailId));
    await Promise.allSettled(promises);
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

      if (emailsWithEmbeddings.length === 0) {
        return {
          status: 200,
          data: {
            query,
            results: [],
            totalResults: 0,
            message: 'No emails with embeddings found. Generate embeddings first.',
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

      // Fetch inbox emails
      const inboxData = await this.gmailService.listMessagesInLabel(userId, 'INBOX', limit);
      
      if (!inboxData?.messages || inboxData.messages.length === 0) {
        return {
          status: 200,
          message: 'No emails to index',
          indexed: 0,
        };
      }

      const emailIds = inboxData.messages.map(m => m.id).filter(Boolean);

      // Batch process embeddings
      await this.batchGenerateEmbeddings(userId, emailIds);

      return {
        status: 200,
        message: `Successfully indexed ${emailIds.length} emails`,
        indexed: emailIds.length,
      };
    } catch (err) {
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
