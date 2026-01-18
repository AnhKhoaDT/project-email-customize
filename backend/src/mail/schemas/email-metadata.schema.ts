import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EmailMetadataDocument = EmailMetadata & Document;

// ============================================
// SYNC STATUS - Theo dõi trạng thái đồng bộ với Gmail
// ============================================
export interface SyncStatus {
  state: 'SYNCED' | 'PENDING' | 'ERROR';
  lastAttempt?: Date;
  errorMessage?: string;
  retryCount?: number;
}

@Schema({ timestamps: true })
export class EmailMetadata {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  emailId: string; // Gmail message ID

  // ============================================
  // DYNAMIC KANBAN - PRIMARY SOURCE OF TRUTH
  // ============================================
  /**
   * [PRIMARY] Kanban Column ID - User's decision
   * Đây là source of truth quyết định email thuộc cột nào
   * Không phụ thuộc vào Gmail labels
   */
  @Prop({ required: true })
  kanbanColumnId: string;

  /**
   * [SYNCED] Gmail Label IDs - Reflects kanban state
   * Được đồng bộ từ kanbanColumnId thông qua column mapping
   * Luôn phản ánh đúng trạng thái kanban
   */
  @Prop({ type: [String], default: [] })
  labelIds: string[];

  /**
   * [CACHE] Column name - Denormalized để hiển thị nhanh
   */
  @Prop()
  cachedColumnName?: string;

  /**
   * Timestamp khi email được move giữa các columns
   */
  @Prop()
  kanbanUpdatedAt?: Date;

  /**
   * Position inside the kanban column to preserve user ordering
   * Lower numbers mean higher on the column (index 0 = top)
   */
  @Prop({ type: Number })
  position?: number;

  /**
   * Column trước đó - Dùng cho undo operation
   */
  @Prop()
  previousColumnId?: string;

  // ============================================
  // GMAIL SYNC STATE
  // ============================================
  /**
   * Trạng thái đồng bộ với Gmail API
   * - SYNCED: Đã sync thành công
   * - PENDING: Đang chờ sync (optimistic update)
   * - ERROR: Sync thất bại, cần retry
   */
  @Prop({
    type: Object,
    default: { state: 'SYNCED', retryCount: 0 }
  })
  syncStatus: SyncStatus;



  // ============================================
  // AI-GENERATED SUMMARY
  // ============================================
  @Prop()
  summary?: string; // AI-generated summary

  @Prop()
  summaryGeneratedAt?: Date; // Timestamp when summary was created

  @Prop()
  summaryModel?: string; // e.g., "gpt-4", "gemini-pro"

  // ============================================
  // SNOOZE DATA
  // ============================================
  @Prop()
  snoozedUntil?: Date; // When to wake up the email

  // Note: previousColumnId (đã định nghĩa ở trên) dùng cho cả snooze và undo operations

  @Prop({ default: false })
  isSnoozed: boolean;

  // ============================================
  // OPTIONAL: CACHE BASIC EMAIL DATA
  // ============================================
  // Cache để giảm calls tới Gmail API (optional)
  @Prop()
  subject?: string;

  @Prop()
  from?: string;

  @Prop()
  threadId?: string;

  @Prop()
  snippet?: string; // Preview text

  @Prop()
  receivedDate?: Date;

  @Prop({ default: false })
  hasAttachment?: boolean;

  @Prop({ type: [Object], default: [] })
  attachments?: any[];

  // ============================================
  // SEMANTIC SEARCH - WEEK 4
  // ============================================
  @Prop({ type: [Number] })
  embedding?: number[]; // Vector embedding for semantic search

  @Prop()
  embeddingText?: string; // Text used to generate the embedding

  @Prop()
  embeddingGeneratedAt?: Date; // Timestamp when embedding was created

  // ============================================
  // INDEXES
  // ============================================
  // Index for fast queries
}

export const EmailMetadataSchema = SchemaFactory.createForClass(EmailMetadata);

// Create compound index for userId + emailId (unique per user)
EmailMetadataSchema.index({ userId: 1, emailId: 1 }, { unique: true });

// Index for snooze queries
EmailMetadataSchema.index({ isSnoozed: 1, snoozedUntil: 1 });

// Index for finding user's emails with summaries
EmailMetadataSchema.index({ userId: 1, summary: 1 });

// ============================================
// DYNAMIC KANBAN INDEXES
// ============================================
// Compound index cho Kanban queries by kanbanColumnId (NEW PRIMARY)
EmailMetadataSchema.index({ userId: 1, kanbanColumnId: 1 });

// Index to support ordering queries within a column
EmailMetadataSchema.index({ userId: 1, kanbanColumnId: 1, position: 1 });

// Index cho label-based queries (SYNCED DATA)
EmailMetadataSchema.index({ userId: 1, labelIds: 1 });

// Index for thread lookup
EmailMetadataSchema.index({ userId: 1, threadId: 1 });

// Index cho pending sync operations
EmailMetadataSchema.index({ 'syncStatus.state': 1, 'syncStatus.retryCount': 1 });

// ============================================
// TEXT SEARCH INDEX for Fuzzy Search
// ============================================
// Compound text index on searchable fields (subject, from, snippet)
// Weights: subject is most important, then from, then snippet
EmailMetadataSchema.index(
  {
    subject: 'text',
    from: 'text',
    snippet: 'text'
  },
  {
    weights: {
      subject: 10,  // Highest priority
      from: 5,      // Medium priority
      snippet: 1    // Lowest priority
    },
    name: 'email_text_search'
  }
);

// Index for finding unsynced emails
EmailMetadataSchema.index({ isSynced: 1 });
