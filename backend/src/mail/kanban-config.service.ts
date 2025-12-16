import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KanbanConfig, KanbanColumn } from './schemas/kanban-config.schema';
import { GmailService } from './gmail.service';
import { EmailMetadataService } from './email-metadata.service';

/**
 * Kanban Configuration Service - Week 4 Feature III
 * 
 * Manages custom Kanban board columns and Gmail label mapping.
 * Allows users to create, update, delete, and reorder columns.
 */

@Injectable()
export class KanbanConfigService {
  constructor(
    @InjectModel(KanbanConfig.name) private kanbanConfigModel: Model<KanbanConfig>,
    private gmailService: GmailService,
    private emailMetadataService: EmailMetadataService,
  ) {}

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
   */
  private async createDefaultConfig(userId: string): Promise<any> {
    const defaultColumns: KanbanColumn[] = [
      {
        id: 'todo',
        name: 'To Do',
        order: 0,
        gmailLabel: 'STARRED', // Map to Gmail starred
        color: '#FFA500',
        isVisible: true,
      },
      {
        id: 'in_progress',
        name: 'In Progress',
        order: 1,
        gmailLabel: 'IMPORTANT', // Map to Gmail important
        color: '#4169E1',
        isVisible: true,
      },
      {
        id: 'done',
        name: 'Done',
        order: 2,
        gmailLabel: null, // No label mapping (custom logic)
        color: '#32CD32',
        isVisible: true,
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
    columnData: { name: string; gmailLabel?: string; color?: string }
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
        gmailLabel: columnData.gmailLabel || null,
        color: columnData.color || '#808080',
        isVisible: true,
      };

      config.columns.push(newColumn);
      config.lastModified = new Date();
      await config.save();

      return {
        status: 201,
        message: 'Column created successfully',
        data: newColumn,
      };
    } catch (err) {
      throw new Error(`Failed to create column: ${err.message}`);
    }
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

      // Update column properties
      if (updates.name !== undefined) config.columns[columnIndex].name = updates.name;
      if (updates.gmailLabel !== undefined) config.columns[columnIndex].gmailLabel = updates.gmailLabel;
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
      const config = await this.kanbanConfigModel.findOne({ userId });

      if (!config) {
        throw new Error('Kanban configuration not found');
      }

      const initialLength = config.columns.length;
      config.columns = config.columns.filter(c => c.id !== columnId);

      if (config.columns.length === initialLength) {
        throw new Error('Column not found');
      }

      // Reorder remaining columns
      config.columns.forEach((col, index) => {
        col.order = index;
      });

      config.lastModified = new Date();
      await config.save();

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
      const config = await this.kanbanConfigModel.findOne({ userId });

      if (!config) {
        throw new Error('Kanban configuration not found');
      }

      const column = config.columns.find(c => c.id === columnId);

      if (!column) {
        throw new Error('Column not found');
      }

      // If column has Gmail label mapping, fetch from Gmail
      if (column.gmailLabel) {
        const emails = await this.gmailService.listMessagesInLabel(
          userId,
          column.gmailLabel,
          options.limit || 50
        );

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
      }

      // Otherwise, fetch from database (for custom statuses)
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
}
