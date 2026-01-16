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

  /**
   * Move an email into a column at a specific position, adjusting
   * positions of other emails in source and destination columns.
   */
  async moveEmailWithPosition(
    userId: string,
    emailId: string,
    toColumnId: string,
    destinationIndex?: number,
    columnName?: string,
  ) {
    // Implementation using double/float positions with neighbor averaging.
    // 1) Load destination items (lean for performance)
    // 2) If moving within same column, remove the moved item from list
    // 3) Normalize destinationIndex to [0, destItems.length]
    // 4) Compute prev/next and calculate new position; reindex if gap too small
    // 5) Persist with findOneAndUpdate

    // run moveEmailWithPosition (quiet)
    // Load current metadata for this email (lean)
    const meta = await this.emailMetadataModel.findOne({ userId, emailId }).lean().exec();
    const fromColumnId = meta?.kanbanColumnId || null;

    // 1. Load destination items sorted ascending by position
    let destItems: any[] = await this.emailMetadataModel
      .find({ userId, kanbanColumnId: toColumnId })
      .sort({ position: 1 })
      .lean()
      .exec();

    // 2. If moving within same column, remove the moving item
    if (fromColumnId === toColumnId) {
      destItems = destItems.filter(d => d.emailId !== emailId);
    }

    // 3. Normalize destinationIndex
    if (typeof destinationIndex !== 'number' || destinationIndex > destItems.length) {
      destinationIndex = destItems.length;
    }
    if (destinationIndex < 0) {
      destinationIndex = 0;
    }

    // 4. Neighbors
    const prev = destinationIndex > 0 ? destItems[destinationIndex - 1] : null;
    const next = destItems[destinationIndex] || null;

    const MIN_GAP = 0.00001; // minimal gap resolution for floating positions

    const calculatePos = (pPrev: number | null, pNext: number | null): number => {
      if (pPrev === null && pNext === null) return 60000;
      if (pPrev === null) return (pNext as number) / 2;
      if (pNext === null) return (pPrev as number) + 60000;
      return ((pPrev as number) + (pNext as number)) / 2;
    };

    let newPosition: number;
    let finalPrev: number | null = prev ? Number(prev.position) : null;
    let finalNext: number | null = next ? Number(next.position) : null;

    if (finalPrev !== null && finalNext !== null && (finalNext - finalPrev) < MIN_GAP) {
      // Gap too small -> reindex column, then recompute
      const warnMsg = `Gap too small in column ${toColumnId}. Reindexing positions...`;
      logger.warn(warnMsg);
      console.warn(warnMsg);
      await this.reindexColumnPositions(userId, toColumnId);

      // Reload items and recompute neighbors
      let refreshed = await this.emailMetadataModel
        .find({ userId, kanbanColumnId: toColumnId })
        .sort({ position: 1 })
        .lean()
        .exec();

      if (fromColumnId === toColumnId) {
        refreshed = refreshed.filter(d => d.emailId !== emailId);
      }

      const rPrev = destinationIndex > 0 ? refreshed[destinationIndex - 1] : null;
      const rNext = refreshed[destinationIndex] || null;

      finalPrev = rPrev ? Number(rPrev.position) : null;
      finalNext = rNext ? Number(rNext.position) : null;
      newPosition = calculatePos(finalPrev, finalNext);
    } else {
      newPosition = calculatePos(finalPrev, finalNext);
    }

    // 5. Persist update. Only set previousColumnId when column actually changes.
    const updateObj: any = {
      kanbanColumnId: toColumnId,
      position: newPosition,
      kanbanUpdatedAt: new Date(),
    };
    if (fromColumnId && fromColumnId !== toColumnId) {
      updateObj.previousColumnId = fromColumnId;
    }

    return this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      { $set: updateObj },
      { upsert: true, new: true }
    ).exec();
  }

  async getKanbanColumn(userId: string, emailId: string) {
    const metadata = await this.emailMetadataModel.findOne({ userId, emailId });
    return metadata?.kanbanColumnId;
  }

  async getEmailsByKanbanColumn(userId: string, kanbanColumnId: string, limit: number = 50) {
    // Return items ordered by `position` (ascending). Fallback to kanbanUpdatedAt
    return this.emailMetadataModel
      .find({ userId, kanbanColumnId })
      .sort({ position: 1, kanbanUpdatedAt: -1 })
      .limit(limit);
  }

  /**
   * Reindex column positions with a large gap to make room for inserts.
   * Assigns positions: 0, gap, 2*gap, ...
   */
  async reindexColumnPositions(userId: string, columnId: string, gap: number = 60000) { // 1. Tăng gap mặc định lên 60000
    const docs = await this.emailMetadataModel
      .find({ userId, kanbanColumnId: columnId })
      .sort({ position: 1, kanbanUpdatedAt: -1 }) // Giữ nguyên thứ tự hiện tại
      .select('_id') // 2. Chỉ lấy _id để tối ưu băng thông (quan trọng khi list dài)
      .exec();

    if (!docs || docs.length === 0) return true;

    const ops = docs.map((doc: any, idx: number) => ({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          // 3. QUAN TRỌNG: (idx + 1) để tránh giá trị 0
          $set: { position: (idx + 1) * gap }
        }
      }
    }));

    if (ops.length > 0) {
      await this.emailMetadataModel.bulkWrite(ops);
    }

    return true;
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
    threadId?: string;
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
