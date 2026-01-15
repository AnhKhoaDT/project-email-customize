import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmailMetadata, EmailMetadataDocument } from './schemas/email-metadata.schema';

const logger = new Logger('EmailMetadataService');

@Injectable()
export class EmailMetadataService {
  constructor(
    @InjectModel(EmailMetadata.name)
    private emailMetadataModel: Model<EmailMetadataDocument>,
  ) { }

  // ============================================
  // KANBAN COLUMN METHODS (NEW PRIMARY SOURCE OF TRUTH)
  // ============================================

  async updateKanbanColumn(
    userId: string,
    emailId: string,
    kanbanColumnId: string,
    columnName?: string,
  ) {
    return this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      {
        userId,
        emailId,
        kanbanColumnId, // NEW PRIMARY
        cachedColumnName: columnName, // Cache for display
        kanbanUpdatedAt: new Date(),
      },
      { upsert: true, new: true },
    );
  }

  async getKanbanColumn(userId: string, emailId: string) {
    const metadata = await this.emailMetadataModel.findOne({ userId, emailId });
    return metadata?.kanbanColumnId;
  }

  async getEmailsByKanbanColumn(userId: string, kanbanColumnId: string, limit: number = 50) {
    return this.emailMetadataModel
      .find({ userId, kanbanColumnId })
      .sort({ kanbanUpdatedAt: -1 })
      .limit(limit);
  }

  async getMetadataMap(userId: string): Promise<Map<string, EmailMetadata>> {
    const metadata = await this.emailMetadataModel.find({ userId });
    const map = new Map<string, EmailMetadata>();
    metadata.forEach(item => {
      map.set(item.emailId, item);
    });
    return map;
  }

  // ============================================
  // LEGACY METHODS (DEPRECATED - KEEP FOR BACKWARD COMPATIBILITY)
  // ============================================

  async updateEmailStatus(
    userId: string,
    emailId: string,
    cachedColumnId: string,
  ) {
    return this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      {
        userId,
        emailId,
        cachedColumnId,
        kanbanUpdatedAt: new Date(),
      },
      { upsert: true, new: true },
    );
  }

  async findEmail(userId: string, emailId: string) {
    return this.emailMetadataModel.findOne({ userId, emailId });
  }

  async deleteEmail(userId: string, emailId: string) {
    return this.emailMetadataModel.findOneAndDelete({ userId, emailId });
  }

  async createEmailMetadata(data: {
    userId: string;
    emailId: string;
    cachedColumnId?: string;
    subject?: string;
    from?: string;
    snippet?: string;
    receivedDate?: Date;
  }) {
    return this.emailMetadataModel.create({
      ...data,
      kanbanUpdatedAt: new Date(),
    });
  }

  async getEmailsByStatus(userId: string, columnId: string) {
    return this.emailMetadataModel.find({ userId, cachedColumnId: columnId }).sort({ kanbanUpdatedAt: -1 });
  }

  async getAllKanbanEmails(userId: string) {
    return this.emailMetadataModel.find({ userId }).sort({ kanbanUpdatedAt: -1 });
  }

  /**
   * Get emails by Gmail label ID (for fallback to seed data)
   * @param userId - User ID
   * @param labelId - Gmail label ID (e.g., 'INBOX', 'SENT', 'STARRED')
   * @param limit - Maximum number of emails to return
   */
  async getEmailsByLabel(userId: string, labelId: string, limit: number = 50) {
    return this.emailMetadataModel
      .find({
        userId,
        labelIds: labelId  // MongoDB array field query
      })
      .sort({ receivedDate: -1 })  // Sort by date, newest first
      .limit(limit);
  }

  /**
   * Get all emails (exclude trash, spam, draft, sent)
   * @param userId - User ID
   * @param limit - Maximum number of emails to return
   */
  async getAllEmails(userId: string, limit: number = 300) {
    // System labels to exclude
    const EXCLUDED_LABELS = ['TRASH', 'SPAM', 'DRAFT', 'SENT'];
    
    return this.emailMetadataModel
      .find({
        userId,
        // Exclude emails that have any of the excluded labels
        labelIds: { 
          $not: { 
            $elemMatch: { $in: EXCLUDED_LABELS } 
          } 
        }
      })
      .sort({ receivedDate: -1 })  // Sort by date, newest first
      .limit(limit);
  }

  /**
   * Get emails for inbox column (emails not in other kanban columns)
   * @param userId - User ID
   * @param limit - Maximum number of emails to return
   */
  async getInboxEmails(userId: string, limit: number = 50) {
    // Get emails that are either:
    // 1. Explicitly assigned to 'inbox' column
    // 2. Not assigned to any kanban column yet (kanbanColumnId not set)
    return this.emailMetadataModel
      .find({
        userId,
        $or: [
          { kanbanColumnId: 'inbox' },
          { kanbanColumnId: { $exists: false } },
          { kanbanColumnId: null }
        ]
      })
      .sort({ receivedDate: -1 })  // Sort by date, newest first
      .limit(limit);
  }




  // ============================================
  // SUMMARY METHODS
  // ============================================

  async saveSummary(
    userId: string,
    emailId: string,
    summary: string,
    model: string,
  ) {
    return this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      {
        userId,
        emailId,
        summary,
        summaryGeneratedAt: new Date(),
        summaryModel: model,
      },
      { upsert: true, new: true },
    );
  }

  async getSummary(userId: string, emailId: string) {
    const metadata = await this.emailMetadataModel.findOne({ userId, emailId });
    return metadata?.summary || null;
  }

  async getSummariesForEmails(userId: string, emailIds: string[]) {
    const metadatas = await this.emailMetadataModel.find({
      userId,
      emailId: { $in: emailIds },
      summary: { $exists: true },
    });

    // Return as map: {emailId: summary}
    return metadatas.reduce((acc, meta) => {
      acc[meta.emailId] = meta.summary;
      return acc;
    }, {} as Record<string, string>);
  }

  // ============================================
  // SNOOZE METHODS
  // ============================================

  async snoozeEmail(
    userId: string,
    emailId: string,
    snoozedUntil: Date,
    currentColumnId?: string,
  ) {
    return this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      {
        userId,
        emailId,
        snoozedUntil,
        previousColumnId: currentColumnId,
        isSnoozed: true,
      },
      { upsert: true, new: true },
    );
  }

  async unsnoozeEmail(userId: string, emailId: string) {
    return this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      {
        isSnoozed: false,
        snoozedUntil: null,
      },
      { new: true },
    );
  }

  async getExpiredSnoozes() {
    return this.emailMetadataModel.find({
      isSnoozed: true,
      snoozedUntil: { $lte: new Date() },
    });
  }

  async deleteSnooze(userId: string, emailId: string) {
    return this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      {
        isSnoozed: false,
        snoozedUntil: null,
      },
    );
  }

  // ============================================
  // CACHE METHODS (Optional)
  // ============================================

  async cacheEmailBasicData(
    userId: string,
    emailId: string,
    data: {
      subject?: string;
      from?: string;
      snippet?: string;
      receivedDate?: Date;
    },
  ) {
    return this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      {
        userId,
        emailId,
        ...data,
      },
      { upsert: true, new: true },
    );
  }
}
