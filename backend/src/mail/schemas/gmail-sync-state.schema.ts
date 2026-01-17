import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Gmail Sync State Schema
 * 
 * Tracks Gmail sync state for each user
 * Ensures persistence across server restarts
 */

@Schema({ timestamps: true })
export class GmailSyncState {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  lastHistoryId: string; // Gmail History API ID

  @Prop({ required: true })
  lastSyncAt: Date;

  @Prop({ default: true })
  isActive: boolean; // Enable/disable sync for user

  @Prop({ default: 0 })
  syncCount: number; // Total sync operations

  @Prop({ default: 0 })
  errorCount: number; // Consecutive errors

  @Prop()
  lastError?: string; // Last error message

  @Prop()
  lastErrorAt?: Date; // Last error timestamp

  @Prop({ default: 'history' })
  syncType: 'history' | 'full'; // Current sync mode
}

export type GmailSyncStateDocument = GmailSyncState & Document;

export const GmailSyncStateSchema = SchemaFactory.createForClass(GmailSyncState);

// Index for fast lookups
GmailSyncStateSchema.index({ userId: 1 }, { unique: true });
GmailSyncStateSchema.index({ lastSyncAt: 1 });
GmailSyncStateSchema.index({ isActive: 1 });
