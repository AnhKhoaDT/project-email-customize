import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KanbanConfig, KanbanColumn } from './schemas/kanban-config.schema';
import { GmailService } from './gmail.service';
import { EmailMetadataService } from './email-metadata.service';
import { MoveEmailDto, EmailMovedEvent } from './dto/move-email.dto';
import { EmailMetadata } from './schemas/email-metadata.schema';

/**
 * Kanban Configuration Service - Week 4 Feature III
 * 
 * Manages custom Kanban board columns and Gmail label mapping.
 * Allows users to create, update, delete, and reorder columns.
 * 
 * REFINEMENT:
 * - Uses labelIds as Source of Truth
 * - cachedColumnId for fast queries
 * - EventEmitter2 for async Gmail sync (no Redis/BullMQ needed)
 */

@Injectable()
export class KanbanConfigService {
  constructor(
    @InjectModel(KanbanConfig.name) private kanbanConfigModel: Model<KanbanConfig>,
    @InjectModel(EmailMetadata.name) private emailMetadataModel: Model<EmailMetadata>,
    private gmailService: GmailService,
    private emailMetadataService: EmailMetadataService,
    private eventEmitter: EventEmitter2,
  ) { }

  /**
   * Get user's Kanban configuration
   * Returns default config if none exists
   */
  async getConfig(userId: string): Promise<any> {
    try {
      let config = await this.kanbanConfigModel.findOne({ userId }).lean();

      if (!config) {
        // Create default configuration
        config = await this.createDefaultConfig(userId);
      }

      // SAFETY CHECK: Validate no duplicate labels exist
      // This catches any duplicates that might have slipped through (race conditions, direct DB edits, etc.)
      const validation = await this.validateNoDuplicateLabels(userId);
      if (!validation.isValid) {
        console.warn(`⚠️ Duplicate Gmail labels detected for user ${userId}:`, validation.duplicates);
        // Optionally: Auto-fix duplicates
        // await this.fixDuplicateLabels(userId);
      }

      return {
        status: 200,
        data: config,
      };
    } catch (err) {
      throw new Error(`Failed to get Kanban config: ${err.message}`);
    }
  }

  /**
   * Create default Kanban configuration
   * 
   * ⚠️ WARNING: Default columns use system labels (STARRED, IMPORTANT)
   * User-created columns should NOT reuse these labels to avoid conflicts
   */
  private async createDefaultConfig(userId: string): Promise<any> {
    const defaultColumns: KanbanColumn[] = [
      {
        id: 'todo',
        name: 'To Do',
        order: 0,
        gmailLabel: 'STARRED',
        mappingType: 'label',
        color: '#FFA500',
        isVisible: true,
        emailCount: 0,
      },
      {
        id: 'in_progress',
        name: 'In Progress',
        order: 1,
        gmailLabel: 'IMPORTANT',
        mappingType: 'label',
        color: '#4169E1',
        isVisible: true,
        emailCount: 0,
      },
      {
        id: 'done',
        name: 'Done',
        order: 2,
        gmailLabel: null,
        mappingType: 'label',
        color: '#32CD32',
        isVisible: true,
        emailCount: 0,
      },
    ];

    const config = await this.kanbanConfigModel.create({
      userId,
      columns: defaultColumns,
      showInbox: true,
      defaultSort: 'date',
      lastModified: new Date(),
    });

    return config.toObject();
  }

  /**
   * Create a new column
   */
  async createColumn(
    userId: string,
    columnData: { name: string; gmailLabel?: string; color?: string; createNewLabel?: boolean }
  ): Promise<any> {
    try {
      let config = await this.kanbanConfigModel.findOne({ userId });

      if (!config) {
        config = await this.kanbanConfigModel.create({
          userId,
          columns: [],
          showInbox: true,
          lastModified: new Date(),
        });
      }

      // ============================================
      // VALIDATION: Block Gmail reserved label names ONLY when creating new labels
      // ============================================
      const GMAIL_RESERVED_LABELS = [
        'inbox', 'sent', 'drafts', 'spam', 'trash', 'starred',
        'important', 'unread', 'chat', 'scheduled', 'snoozed'
      ];

      let finalGmailLabel = columnData.gmailLabel;

      // Only block reserved names when CREATING NEW labels, not when mapping to existing ones
      if (finalGmailLabel && columnData.createNewLabel && GMAIL_RESERVED_LABELS.includes(finalGmailLabel.toLowerCase())) {
        throw new Error(
          `Cannot create new label with reserved Gmail label name "${finalGmailLabel}". ` +
          `Reserved labels: ${GMAIL_RESERVED_LABELS.join(', ')}. ` +
          `Tip: Use "Map to existing label" option to map with system labels like IMPORTANT, STARRED, etc.`
        );
      }

      // If createNewLabel is true, create the label on Gmail first
      if (columnData.createNewLabel && finalGmailLabel) {
        console.log(`🏷️ Creating new Gmail label: "${finalGmailLabel}" for user ${userId}`);
        try {
          const labelCreated = await this.gmailService.createLabel(userId, finalGmailLabel);
          console.log(`✅ Gmail label created successfully:`, {
            name: labelCreated.name,
            id: labelCreated.id,
            visibility: labelCreated.labelListVisibility
          });

          // IMPORTANT: Use label ID instead of name for Gmail operations
          finalGmailLabel = labelCreated.id;
        } catch (err) {
          console.error(`❌ Error creating Gmail label "${finalGmailLabel}":`, err);
          // If label already exists, Gmail API returns 409, which is fine
          if (err?.response?.status === 409 || err?.code === 409) {
            console.log(`ℹ️ Gmail label "${finalGmailLabel}" already exists - getting existing label ID`);
            // Get existing label ID
            try {
              const allLabels = await this.gmailService.listLabels(userId);
              const existingLabel = allLabels.find(label =>
                label.name.toLowerCase() === finalGmailLabel.toLowerCase()
              );
              if (existingLabel) {
                finalGmailLabel = existingLabel.id;
                console.log(`🔗 Using existing label ID: ${finalGmailLabel}`);
              }
            } catch (listErr) {
              console.error('Failed to get existing label ID:', listErr);
            }
          } else {
            // Don't continue if label creation fails for other reasons
            throw new Error(`Failed to create Gmail label: ${err.message}`);
          }
        }
      } else if (!columnData.createNewLabel && finalGmailLabel) {
        console.log(`🔗 Mapping column to existing Gmail label: "${finalGmailLabel}"`);

        // IMPORTANT: Convert label name to label ID for existing labels
        // Gmail system labels have UPPERCASE IDs (IMPORTANT, STARRED, SENT, etc.)
        // but display names are capitalized (Important, Starred, Sent)
        try {
          const allLabels = await this.gmailService.listLabels(userId);

          // First try to find by exact name match (case-insensitive)
          let existingLabel = allLabels.find(label =>
            label.name?.toLowerCase() === finalGmailLabel.toLowerCase() ||
            label.id === finalGmailLabel // Also match by ID in case it's already an ID
          );

          // If not found, try system label ID (UPPERCASE version)
          if (!existingLabel) {
            const systemLabelId = finalGmailLabel.toUpperCase();
            existingLabel = allLabels.find(label => label.id === systemLabelId);

            if (existingLabel) {
              console.log(`🔍 Found system label by ID: ${systemLabelId}`);
            }
          }

          if (existingLabel) {
            finalGmailLabel = existingLabel.id;
            console.log(`🔗 Using existing label ID: ${finalGmailLabel} (name: "${existingLabel.name}")`);
          } else {
            throw new Error(`Gmail label "${finalGmailLabel}" not found`);
          }
        } catch (err) {
          console.error('Failed to get existing label ID:', err);
          throw new Error(`Failed to find Gmail label: ${err.message}`);
        }
      }

      // ============================================
      // VALIDATION: Check for duplicate Gmail label
      // ============================================
      if (finalGmailLabel) {
        const duplicateColumn = config.columns.find(
          col => col.gmailLabel && col.gmailLabel.toLowerCase() === finalGmailLabel.toLowerCase()
        );

        if (duplicateColumn) {
          throw new Error(
            `Gmail label "${finalGmailLabel}" is already mapped to column "${duplicateColumn.name}". ` +
            `Each Gmail label can only be mapped to one Kanban column.`
          );
        }
      }

      // ============================================
      // VALIDATION: Check for duplicate column name (optional but recommended)
      // ============================================
      const duplicateName = config.columns.find(
        col => col.name.toLowerCase() === columnData.name.toLowerCase()
      );

      if (duplicateName) {
        throw new Error(
          `Column name "${columnData.name}" already exists. Please choose a different name.`
        );
      }

      // Generate unique column ID
      const columnId = `col_${Date.now()}`;

      // Determine order (last position)
      const maxOrder = config.columns.length > 0
        ? Math.max(...config.columns.map(c => c.order))
        : -1;

      const newColumn: KanbanColumn = {
        id: columnId,
        name: columnData.name,
        order: maxOrder + 1,
        gmailLabel: finalGmailLabel || null,
        gmailLabelName: null,
        mappingType: 'label',
        color: columnData.color || '#808080',
        isVisible: true,
        emailCount: 0,
      };

      // If we resolved an existing label earlier, try to store its friendly name
      if (finalGmailLabel) {
        try {
          const allLabels = await this.gmailService.listLabels(userId);
          const found = allLabels.find(l => l.id === finalGmailLabel || l.name?.toLowerCase() === (columnData.gmailLabel || '').toLowerCase());
          if (found) newColumn.gmailLabelName = found.name;
        } catch (err) {
          // ignore - optional metadata
        }
      }

      config.columns.push(newColumn);
      config.lastModified = new Date();
      await config.save();

      // Fetch emails from Gmail only if using existing label
      // (New labels won't have any emails yet)
      let emails = [];
      if (finalGmailLabel && !columnData.createNewLabel) {
        try {
          console.log(`📧 Fetching emails for new column "${columnData.name}" with existing label ID: ${finalGmailLabel}`);
          const emailsResult = await this.gmailService.listMessagesInLabel(
            userId,
            finalGmailLabel,
            50 // Default limit
          );
          emails = emailsResult.messages || [];
          console.log(`✅ Fetched ${emails.length} emails for new column`);
        } catch (err) {
          console.error(`⚠️ Failed to fetch emails for new column:`, err);
          // Don't fail column creation if email fetch fails
          // Emails will be loaded when user opens the column
        }
      } else if (columnData.createNewLabel) {
        console.log(`ℹ️ Skipping email fetch - new label created, no emails to fetch yet`);
      }

      return {
        status: 201,
        message: 'Column created successfully',
        data: {
          ...newColumn,
          emails, // Include fetched emails in response (empty array if new label)
        },
      };
    } catch (err) {
      throw new Error(`Failed to create column: ${err.message}`);
    }
  }

  /**
   * HELPER: Validate no duplicate Gmail labels exist
   * This is a safety check that can be called periodically or after bulk operations
   */
  async validateNoDuplicateLabels(userId: string): Promise<{ isValid: boolean; duplicates: string[] }> {
    const config = await this.kanbanConfigModel.findOne({ userId });
    if (!config) {
      return { isValid: true, duplicates: [] };
    }

    const labelMap = new Map<string, string[]>();

    for (const col of config.columns) {
      if (col.gmailLabel) {
        const normalizedLabel = col.gmailLabel.toLowerCase();
        if (!labelMap.has(normalizedLabel)) {
          labelMap.set(normalizedLabel, []);
        }
        labelMap.get(normalizedLabel).push(col.name);
      }
    }

    const duplicates: string[] = [];
    labelMap.forEach((columns, label) => {
      if (columns.length > 1) {
        duplicates.push(`Gmail label "${label}" is mapped to: ${columns.join(', ')}`);
      }
    });

    return {
      isValid: duplicates.length === 0,
      duplicates
    };
  }

  /**
   * FIX: Clean up duplicate Gmail label mappings
   * Keeps the first occurrence, removes duplicates from other columns
   */
  async fixDuplicateLabels(userId: string): Promise<{ fixed: number; details: string[] }> {
    const config = await this.kanbanConfigModel.findOne({ userId });
    if (!config) {
      return { fixed: 0, details: [] };
    }

    const seenLabels = new Set<string>();
    const details: string[] = [];
    let fixedCount = 0;

    for (const col of config.columns) {
      if (col.gmailLabel) {
        const normalizedLabel = col.gmailLabel.toLowerCase();

        if (seenLabels.has(normalizedLabel)) {
          // Duplicate found - remove gmailLabel
          details.push(`Removed duplicate label "${col.gmailLabel}" from column "${col.name}"`);
          col.gmailLabel = null;
          fixedCount++;
        } else {
          seenLabels.add(normalizedLabel);
        }
      }
    }

    if (fixedCount > 0) {
      config.lastModified = new Date();
      await config.save();
    }

    return { fixed: fixedCount, details };
  }

  /**
   * Update a column
   */
  async updateColumn(
    userId: string,
    columnId: string,
    updates: { name?: string; gmailLabel?: string; color?: string; isVisible?: boolean }
  ): Promise<any> {
    try {
      const config = await this.kanbanConfigModel.findOne({ userId });

      if (!config) {
        throw new Error('Kanban configuration not found');
      }

      const columnIndex = config.columns.findIndex(c => c.id === columnId);

      if (columnIndex === -1) {
        throw new Error('Column not found');
      }

      // ============================================
      // VALIDATION: Check for duplicate Gmail label (if updating gmailLabel)
      // ============================================
      if (updates.gmailLabel !== undefined && updates.gmailLabel) {
        const duplicateColumn = config.columns.find(
          (col, idx) =>
            idx !== columnIndex && // Exclude current column
            col.gmailLabel &&
            col.gmailLabel.toLowerCase() === updates.gmailLabel.toLowerCase()
        );

        if (duplicateColumn) {
          throw new Error(
            `Gmail label "${updates.gmailLabel}" is already mapped to column "${duplicateColumn.name}". ` +
            `Each Gmail label can only be mapped to one Kanban column.`
          );
        }
      }

      // ============================================
      // VALIDATION: Check for duplicate column name (if updating name)
      // ============================================
      if (updates.name !== undefined) {
        const duplicateName = config.columns.find(
          (col, idx) =>
            idx !== columnIndex && // Exclude current column
            col.name.toLowerCase() === updates.name.toLowerCase()
        );

        if (duplicateName) {
          throw new Error(
            `Column name "${updates.name}" already exists. Please choose a different name.`
          );
        }
      }

      // Update column properties
      if (updates.name !== undefined) config.columns[columnIndex].name = updates.name;
      if (updates.gmailLabel !== undefined) {
        config.columns[columnIndex].gmailLabel = updates.gmailLabel;
        // Try to resolve friendly name
        try {
          const allLabels = await this.gmailService.listLabels(userId);
          const found = allLabels.find(l => l.id === updates.gmailLabel || l.name?.toLowerCase() === updates.gmailLabel.toLowerCase());
          config.columns[columnIndex].gmailLabelName = found ? found.name : undefined;
        } catch (err) {
          // ignore
        }
      }
      if (updates.color !== undefined) config.columns[columnIndex].color = updates.color;
      if (updates.isVisible !== undefined) config.columns[columnIndex].isVisible = updates.isVisible;

      config.lastModified = new Date();
      await config.save();

      return {
        status: 200,
        message: 'Column updated successfully',
        data: config.columns[columnIndex],
      };
    } catch (err) {
      throw new Error(`Failed to update column: ${err.message}`);
    }
  }

  /**
   * Delete a column
   */
  async deleteColumn(userId: string, columnId: string): Promise<any> {
    try {
      // 1. Load config từ DB
      const config = await this.kanbanConfigModel.findOne({ userId });
      if (!config) {
        throw new Error('Kanban configuration not found');
      }

      // 2. Kiểm tra cột có tồn tại không
      const initialLength = config.columns.length;
      const newColumns = config.columns.filter(col => col.id !== columnId);

      if (newColumns.length === initialLength) {
        throw new Error('Column not found');
      }

      // 3. Reorder lại index 
      newColumns.forEach((col, index) => {
        col.order = index;
      });

      // 4. Gán lại vào config
      config.columns = newColumns;
      config.lastModified = new Date();
      config.markModified('columns'); // Báo cho Mongoose biết mảng đã thay đổi

      // 5. LƯU MÀ KHÔNG VALIDATE - Force save dù còn duplicate
      await config.save({ validateBeforeSave: false });

      return {
        status: 200,
        message: 'Column deleted successfully',
      };
    } catch (err) {
      throw new Error(`Failed to delete column: ${err.message}`);
    }
  }

  /**
   * Reorder columns
   */
  async reorderColumns(userId: string, columnOrder: string[]): Promise<any> {
    try {
      const config = await this.kanbanConfigModel.findOne({ userId });

      if (!config) {
        throw new Error('Kanban configuration not found');
      }

      // Update order based on array position
      columnOrder.forEach((columnId, index) => {
        const column = config.columns.find(c => c.id === columnId);
        if (column) {
          column.order = index;
        }
      });

      // Sort columns by order
      config.columns.sort((a, b) => a.order - b.order);

      config.lastModified = new Date();
      await config.save();

      return {
        status: 200,
        message: 'Columns reordered successfully',
        data: config.columns,
      };
    } catch (err) {
      throw new Error(`Failed to reorder columns: ${err.message}`);
    }
  }

  /**
   * Sync email with Gmail label when moving between columns
   */
  async syncEmailLabel(
    userId: string,
    emailId: string,
    fromColumnId: string,
    toColumnId: string
  ): Promise<void> {
    try {
      const config = await this.kanbanConfigModel.findOne({ userId });

      if (!config) {
        return; // No label mapping if no config
      }

      const fromColumn = config.columns.find(c => c.id === fromColumnId);
      const toColumn = config.columns.find(c => c.id === toColumnId);

      // Remove old label if exists
      if (fromColumn?.gmailLabel) {
        await this.gmailService.modifyEmailLabels(userId, emailId, {
          removeLabelIds: [fromColumn.gmailLabel],
          addLabelIds: [],
        });
      }

      // Add new label if exists
      if (toColumn?.gmailLabel) {
        await this.gmailService.modifyEmailLabels(userId, emailId, {
          removeLabelIds: [],
          addLabelIds: [toColumn.gmailLabel],
        });
      }
    } catch (err) {
      console.error(`Failed to sync email label: ${err.message}`);
      // Don't throw - allow move to continue even if label sync fails
    }
  }

  /**
   * Get emails for a specific column based on label mapping
   */
  async getColumnEmails(
    userId: string,
    columnId: string,
    options: { limit?: number; sortBy?: string; filterUnread?: boolean; filterAttachment?: boolean } = {}
  ): Promise<any> {
    try {
      console.log(`📬 getColumnEmails called - userId: ${userId}, columnId: ${columnId}`);

      const config = await this.kanbanConfigModel.findOne({ userId });

      if (!config) {
        console.error(`❌ Kanban configuration not found for userId: ${userId}`);
        throw new Error('Kanban configuration not found');
      }

      const column = config.columns.find(c => c.id === columnId);

      if (!column) {
        console.error(`❌ Column not found - columnId: ${columnId}, available columns: ${config.columns.map(c => c.id).join(', ')}`);
        throw new Error('Column not found');
      }

      console.log(`📋 Column found - name: "${column.name}", gmailLabel: "${column.gmailLabel}", hasLabelError: ${column.hasLabelError}`);

      // If column has Gmail label mapping, fetch from Gmail
      if (column.gmailLabel) {
        try {
          console.log(`📧 Fetching emails from Gmail with labelId: ${column.gmailLabel}, limit: ${options.limit || 50}`);

          const emails = await this.gmailService.listMessagesInLabel(
            userId,
            column.gmailLabel,
            options.limit || 50
          );

          console.log(`✅ Successfully fetched ${emails.messages?.length || 0} emails for column "${column.name}"`);

          // Clear any previous error state (label is working again)
          if (column.hasLabelError) {
            column.hasLabelError = false;
            column.labelErrorMessage = undefined;
            column.labelErrorDetectedAt = undefined;
            await config.save();
          }

          // Apply filters if specified
          let filteredEmails = emails.messages || [];

          if (options.filterUnread) {
            filteredEmails = filteredEmails.filter(e => e.isUnread);
          }

          if (options.filterAttachment) {
            filteredEmails = filteredEmails.filter(e => e.hasAttachment);
          }

          // Apply sorting
          if (options.sortBy === 'date-desc') {
            filteredEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          } else if (options.sortBy === 'date-asc') {
            filteredEmails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          }

          return {
            status: 200,
            data: {
              columnId,
              columnName: column.name,
              messages: filteredEmails,
              total: filteredEmails.length,
            },
          };
        } catch (error) {
          // Fallback to MongoDB seed data if Gmail fails
          console.log(`⚠️ Gmail API failed for column "${column.name}", falling back to MongoDB seed data`);

          const dbEmails = await this.emailMetadataService.getEmailsByLabel(userId, column.gmailLabel, options.limit || 50);

          // Format to match Gmail API response
          const formattedEmails = dbEmails.map(email => ({
            id: email.emailId,
            threadId: email.threadId,
            labelIds: email.labelIds,
            snippet: email.snippet || '',
            subject: email.subject || 'No subject',
            from: email.from || 'Unknown',
            date: email.receivedDate?.toISOString() || new Date().toISOString(),
            isUnread: !email.labelIds?.includes('READ'),
            hasAttachment: false,
          }));

          return {
            status: 200,
            data: {
              columnId,
              columnName: column.name,
              messages: formattedEmails,
              total: formattedEmails.length,
            },
          };
        }
      }

      // Otherwise, fetch from database (for custom statuses)
      console.log(`💾 Column "${column.name}" has no Gmail label, fetching from database instead`);
      const dbEmails = await this.emailMetadataService.getEmailsByStatus(userId, columnId as any);

      return {
        status: 200,
        data: {
          columnId,
          columnName: column.name,
          messages: dbEmails,
          total: dbEmails.length,
        },
      };
    } catch (err) {
      throw new Error(`Failed to get column emails: ${err.message}`);
    }
  }

  // ============================================
  // 🔥 REFINEMENT: MOVE EMAIL WITH LABEL SYNC
  // ============================================
  /**
   * Move email between Kanban columns
   * 
   * ARCHITECTURE:
   * 1. Validate columns exist in user's config
   * 2. Determine label operations (add/remove)
   * 3. OPTIMISTIC UPDATE: Update DB first (labelIds + cachedColumnId)
   * 4. ASYNC SYNC: Emit event for background Gmail API call
   * 5. Return immediately (Optimistic UI)
   * 
   * REFINEMENT:
   * - Phân biệt logic INBOX vs Custom Columns
   * - labelIds là Source of Truth
   * - cachedColumnId là derived data
   * - EventEmitter2 thay vì BullMQ (gọn nhẹ hơn)
   */
  async moveEmail(userId: string, dto: MoveEmailDto): Promise<any> {
    try {
      // ============================================
      // STEP 1: Validate & Load Config
      // ============================================
      const config = await this.kanbanConfigModel.findOne({ userId });
      if (!config) {
        throw new Error('Kanban configuration not found');
      }

      const fromColumn = config.columns.find(c => c.id === dto.fromColumnId);
      const toColumn = config.columns.find(c => c.id === dto.toColumnId);

      if (!toColumn) {
        throw new Error('Destination column not found');
      }

      // fromColumn có thể null nếu source là 'inbox'
      if (!fromColumn && dto.fromColumnId !== 'inbox') {
        throw new Error('Source column not found');
      }

      // ============================================
      // STEP 2: Determine Gmail Label Operations
      // ============================================
      const labelsToAdd: string[] = [];
      const labelsToRemove: string[] = [];

      // 🔥 REFINEMENT: Logic phân biệt INBOX vs Custom Column
      if (dto.fromColumnId === 'inbox') {
        // Moving FROM Inbox: Remove INBOX label
        labelsToRemove.push('INBOX');
      } else if (fromColumn?.gmailLabel) {
        // Moving FROM Custom Column: Remove old label
        labelsToRemove.push(fromColumn.gmailLabel);
      }

      if (toColumn.gmailLabel) {
        // Moving TO Column with label: Add label
        labelsToAdd.push(toColumn.gmailLabel);
      }

      // Special handling: Auto-archive
      if (toColumn.autoArchive) {
        labelsToRemove.push('INBOX');
        // Gmail không có ARCHIVED label, chỉ cần remove INBOX
      }

      // Special handling: Remove INBOX label
      if (toColumn.removeInboxLabel) {
        labelsToRemove.push('INBOX');
      }

      // Remove duplicates
      const uniqueLabelsToAdd = [...new Set(labelsToAdd)];
      const uniqueLabelsToRemove = [...new Set(labelsToRemove)];

      // ============================================
      // STEP 3: OPTIMISTIC UPDATE - Update DB First
      // ============================================
      // 🔥 KEY CHANGE: Update labelIds (Source of Truth)
      const currentMetadata = await this.emailMetadataModel.findOne({
        userId,
        emailId: dto.emailId,
      });

      let currentLabelIds = currentMetadata?.labelIds || ['INBOX'];

      // Update labelIds: Remove old, add new
      currentLabelIds = currentLabelIds.filter(
        label => !uniqueLabelsToRemove.includes(label)
      );
      currentLabelIds.push(...uniqueLabelsToAdd);

      // Remove duplicates
      currentLabelIds = [...new Set(currentLabelIds)];

      const metadata = await this.emailMetadataModel.findOneAndUpdate(
        { userId, emailId: dto.emailId },
        {
          // 🔥 PRIMARY: Update Source of Truth
          labelIds: currentLabelIds,

          // 🔥 CACHE: Update derived data
          cachedColumnId: dto.toColumnId,
          cachedColumnName: toColumn.name,
          previousColumnId: dto.fromColumnId,

          kanbanUpdatedAt: new Date(),

          // Sync status
          syncStatus: {
            state: 'PENDING',
            lastAttempt: new Date(),
            retryCount: 0,
            errorMessage: null,
          },
        },
        { upsert: true, new: true }
      );

      // ============================================
      // STEP 4: ASYNC GMAIL API CALL via EventEmitter
      // ============================================
      // 🔥 REFINEMENT: Dùng EventEmitter thay vì BullMQ
      // Không await ở đây - client nhận response ngay lập tức!
      const event: EmailMovedEvent = {
        userId,
        emailId: dto.emailId,
        fromColumnId: dto.fromColumnId,
        toColumnId: dto.toColumnId,
        labelsToAdd: uniqueLabelsToAdd,
        labelsToRemove: uniqueLabelsToRemove,
        metadataId: metadata._id.toString(),
        timestamp: new Date(),
      };

      this.eventEmitter.emit('email.moved', event);

      // ============================================
      // STEP 5: Return Immediately (Optimistic)
      // ============================================
      return {
        status: 200,
        message: 'Email moved successfully',
        data: {
          emailId: dto.emailId,
          newColumnId: dto.toColumnId,
          newColumnName: toColumn.name,
          labelIds: currentLabelIds,
          isPendingSync: true,
          updatedAt: metadata.kanbanUpdatedAt,
        },
      };
    } catch (err) {
      throw new Error(`Failed to move email: ${err.message}`);
    }
  }

  /**
   * Helper: Check if error is Gmail label not found
   */
  private isLabelNotFoundError(error: any): boolean {
    const errorStr = error?.message?.toLowerCase() || '';
    const errorCode = error?.code;

    return (
      errorCode === 404 ||
      errorStr.includes('label not found') ||
      errorStr.includes('invalid label') ||
      errorStr.includes('invalidlabelid') ||
      errorStr.includes('label does not exist') ||
      errorStr.includes('requested entity was not found') ||  // Gmail API standard error
      errorStr.includes('not found') ||                        // Generic not found
      errorStr.includes('may have been deleted')               // Our custom message
    );
  }

  /**
   * Remap column to different Gmail label (recovery from deleted label)
   */
  async remapColumnLabel(
    userId: string,
    columnId: string,
    newGmailLabel?: string,
    createNewLabel?: boolean,
    labelName?: string,
    color?: string
  ): Promise<any> {
    try {
      const config = await this.kanbanConfigModel.findOne({ userId });

      if (!config) {
        throw new Error('Kanban configuration not found');
      }

      const column = config.columns.find(c => c.id === columnId);

      if (!column) {
        throw new Error('Column not found');
      }

      // Option 1: Create new label with same/custom name
      if (createNewLabel) {
        const finalLabelName = labelName || column.name;
        const labelColor = color ? { backgroundColor: color, textColor: '#000000' } : undefined;

        const createdLabel = await this.gmailService.createLabel(userId, finalLabelName, labelColor);

        column.gmailLabel = createdLabel.id;
        column.gmailLabelName = createdLabel.name;
        column.hasLabelError = false;
        column.labelErrorMessage = undefined;
        column.labelErrorDetectedAt = undefined;

        await config.save();

        return {
          status: 200,
          message: `Created new Gmail label and remapped column`,
          data: {
            columnId,
            newLabelId: createdLabel.id,
            labelName: createdLabel.name,
          },
        };
      }

      // Option 2: Remap to existing label
      if (newGmailLabel) {
        // Validate label exists in Gmail (accept id or name)
        const labels = await this.gmailService.listLabels(userId);
        const labelObj = labels.find(l => l.id === newGmailLabel || (l.name && l.name.toLowerCase() === newGmailLabel.toLowerCase()));

        if (!labelObj) {
          throw new Error('Selected Gmail label does not exist');
        }

        // Check for duplicates
        const isDuplicate = config.columns.some(
          c => c.id !== columnId && c.gmailLabel === newGmailLabel
        );

        if (isDuplicate) {
          throw new Error('Another column is already mapped to this Gmail label');
        }

        column.gmailLabel = labelObj.id;
        // store friendly name
        column.gmailLabelName = labelObj.name;
        column.hasLabelError = false;
        column.labelErrorMessage = undefined;
        column.labelErrorDetectedAt = undefined;

        await config.save();

        return {
          status: 200,
          message: 'Column remapped successfully',
          data: {
            columnId,
            newLabelId: newGmailLabel,
          },
        };
      }

      throw new Error('Must specify either newGmailLabel or createNewLabel');
    } catch (err) {
      throw new Error(`Failed to remap label: ${err.message}`);
    }
  }

  /**
   * Clear column error state (manual recovery)
   */
  async clearColumnError(userId: string, columnId: string): Promise<any> {
    try {
      const config = await this.kanbanConfigModel.findOne({ userId });

      if (!config) {
        throw new Error('Kanban configuration not found');
      }

      const column = config.columns.find(c => c.id === columnId);

      if (!column) {
        throw new Error('Column not found');
      }

      column.hasLabelError = false;
      column.labelErrorMessage = undefined;
      column.labelErrorDetectedAt = undefined;

      await config.save();

      return {
        status: 200,
        message: 'Column error cleared',
        data: { columnId },
      };
    } catch (err) {
      throw new Error(`Failed to clear error: ${err.message}`);
    }
  }
}
