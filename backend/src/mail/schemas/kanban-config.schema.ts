import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type KanbanConfigDocument = KanbanConfig & Document;

/**
 * Kanban Column Configuration - Week 4 Feature III
 * 
 * Allows users to customize their Kanban board with custom columns.
 * Each column can be mapped to a Gmail label for automatic syncing.
 */

@Schema({ timestamps: true })
export class KanbanColumn {
  @Prop({ required: true })
  id: string; // Unique column ID (e.g., "col_1", "col_2")

  @Prop({ required: true })
  name: string; // Display name (e.g., "To Do", "In Progress", "Done")

  @Prop({ required: true })
  order: number; // Display order (0, 1, 2, ...)

  @Prop()
  gmailLabel?: string; // Gmail label to sync with (e.g., "STARRED", "IMPORTANT", custom label ID)

  @Prop()
  color?: string; // Optional color for UI (e.g., "#FF5733")

  @Prop({ default: true })
  isVisible: boolean; // Whether column is visible on board
}

export const KanbanColumnSchema = SchemaFactory.createForClass(KanbanColumn);

@Schema({ timestamps: true })
export class KanbanConfig {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop({ type: [KanbanColumnSchema], default: [] })
  columns: KanbanColumn[];

  @Prop({ default: false })
  showInbox: boolean; // Whether to show INBOX as a source column

  @Prop({ default: 'name' })
  defaultSort: string; // Default sort field (name, date, etc.)

  @Prop()
  lastModified: Date;
}

export const KanbanConfigSchema = SchemaFactory.createForClass(KanbanConfig);

// Index for fast user queries
KanbanConfigSchema.index({ userId: 1 });
