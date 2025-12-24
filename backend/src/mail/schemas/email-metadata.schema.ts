import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EmailMetadataDocument = EmailMetadata & Document;

// Enum cho Kanban status
// ⚠️ INBOX không có trong enum vì emails trong inbox không lưu DB
export enum EmailStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

@Schema({ timestamps: true })
export class EmailMetadata {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  emailId: string; // Gmail message ID

  @Prop({ required: true })
  threadId: string; // Gmail thread ID

  // ============================================
  // KANBAN STATUS 
  // ============================================
  @Prop({ 
    type: String, 
    enum: Object.values(EmailStatus),
    required: false  // Changed to false for semantic search indexing
  })
  status?: EmailStatus; // Optional: Only set when email is in Kanban

  @Prop()
  statusUpdatedAt?: Date; // Timestamp khi status thay đổi



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

  @Prop()
  originalStatus?: string; // Status before snoozing (TODO/IN_PROGRESS/DONE)

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
  snippet?: string; // Preview text

  @Prop()
  receivedDate?: Date;

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

// Index for Kanban queries by status
EmailMetadataSchema.index({ userId: 1, status: 1 });

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
