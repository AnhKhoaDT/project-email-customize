import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmailMetadata, EmailMetadataDocument } from '../mail/schemas/email-metadata.schema';

@Injectable()
export class KanbanColumnIdMigration {
  private readonly logger = new Logger(KanbanColumnIdMigration.name);

  constructor(
    @InjectModel(EmailMetadata.name)
    private emailMetadataModel: Model<EmailMetadataDocument>,
  ) {}

  /**
   * Migration: Convert from cachedColumnId to kanbanColumnId
   * 
   * OLD: cachedColumnId (derived from labelIds)
   * NEW: kanbanColumnId (primary source of truth)
   */
  async migrate(): Promise<void> {
    this.logger.log('🔄 Starting KanbanColumnId migration...');

    try {
      // Step 1: Find all documents with cachedColumnId (using raw query)
      const documents = await this.emailMetadataModel.find({
        $or: [
          { cachedColumnId: { $exists: true, $ne: null } },
          { cachedColumnId: { $exists: true, $ne: '' } }
        ]
      }).lean(); // Use lean() to get plain objects

      this.logger.log(`📊 Found ${documents.length} documents to migrate`);

      // Step 2: Update each document
      for (const doc of documents as any[]) {
        await this.emailMetadataModel.updateOne(
          { _id: doc._id },
          {
            $set: {
              kanbanColumnId: doc.cachedColumnId, // Migrate cachedColumnId to kanbanColumnId
            },
            $unset: {
              cachedColumnId: 1 // Remove old field
            }
          }
        );
      }

      this.logger.log(`✅ Successfully migrated ${documents.length} documents`);

      // Step 3: Handle documents without kanbanColumnId (default to inbox)
      const uncategorizedDocs = await this.emailMetadataModel.find({
        kanbanColumnId: { $exists: false }
      }).lean();

      this.logger.log(`📊 Found ${uncategorizedDocs.length} uncategorized documents`);

      for (const doc of uncategorizedDocs as any[]) {
        await this.emailMetadataModel.updateOne(
          { _id: doc._id },
          {
            $set: {
              kanbanColumnId: 'inbox' // Default to inbox
            }
          }
        );
      }

      this.logger.log(`✅ Successfully set default column for ${uncategorizedDocs.length} documents`);
      this.logger.log('🎉 KanbanColumnId migration completed successfully!');

    } catch (error) {
      this.logger.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Rollback: Convert kanbanColumnId back to cachedColumnId
   */
  async rollback(): Promise<void> {
    this.logger.log('🔄 Starting rollback...');

    try {
      const documents = await this.emailMetadataModel.find({
        kanbanColumnId: { $exists: true }
      }).lean();

      for (const doc of documents as any[]) {
        await this.emailMetadataModel.updateOne(
          { _id: doc._id },
          {
            $set: {
              cachedColumnId: doc.kanbanColumnId,
            },
            $unset: {
              kanbanColumnId: 1
            }
          }
        );
      }

      this.logger.log(`✅ Rollback completed for ${documents.length} documents`);

    } catch (error) {
      this.logger.error('❌ Rollback failed:', error);
      throw error;
    }
  }
}
