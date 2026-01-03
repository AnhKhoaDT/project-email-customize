// file: types/index.ts

export interface User {
  name: string;
  email: string;
  avatar: string; // Sửa lỗi chính tả avartar -> avatar
}

// ============================================
// WEEK 4: DYNAMIC KANBAN TYPES
// ============================================

/**
 * Kanban Column Configuration from Backend
 */
export interface KanbanColumn {
  id: string;
  name: string;
  order: number;
  gmailLabel?: string;
  mappingType?: 'label' | 'search' | 'custom';
  removeInboxLabel?: boolean;
  autoArchive?: boolean;
  color?: string;
  isVisible: boolean;
  emailCount?: number;
  lastSyncedAt?: string;
  
  // Label Error Tracking (Edge Case Handling)
  hasLabelError?: boolean;
  labelErrorMessage?: string;
  labelErrorDetectedAt?: string;
}

/**
 * Kanban Configuration from Backend
 */
export interface KanbanConfig {
  userId: string;
  columns: KanbanColumn[];
  showInbox: boolean;
  syncStrategy?: 'optimistic' | 'pessimistic';
  syncTimeoutMs?: number;
  enableAutoSync?: boolean;
  lastGlobalSync?: string;
  defaultSort: string;
  lastModified: string;
}

/**
 * Email Metadata with Dynamic Kanban Support
 */
export interface EmailMetadata {
  userId: string;
  emailId: string;
  threadId: string;
  
  // Dynamic Kanban
  labelIds: string[];              // Source of Truth
  cachedColumnId?: string;         // Derived cache
  cachedColumnName?: string;
  kanbanUpdatedAt?: string;
  previousColumnId?: string;
  
  // Sync Status
  syncStatus?: {
    state: 'SYNCED' | 'PENDING' | 'ERROR';
    lastAttempt?: string;
    errorMessage?: string;
    retryCount?: number;
  };
  
  // AI Summary
  summary?: string;
  summaryGeneratedAt?: string;
  summaryModel?: string;
  
  // Snooze
  snoozedUntil?: string;
  isSnoozed?: boolean;
  
  // Cached Gmail data
  subject?: string;
  from?: string;
  snippet?: string;
  receivedDate?: string;
  
  // Semantic search
  embedding?: number[];
  embeddingText?: string;
  embeddingGeneratedAt?: string;
}

// Đổi tên MailList thành Mail để dùng chung cho cả app
export interface Mail {
  id: string;
  threadId: string; // Thêm trường này vì MockData có
  labelIds: string[]; // Thêm trường này
  snippet: string; // Thêm trường này (quan trọng cho MailContent)

  from: string;
  to: string;
  subject: string;
  date: string;

  // Nội dung mail có thể là body hoặc htmlBody tùy nguồn dữ liệu
  // Để optional (?) để linh hoạt
  body?: string;
  htmlBody?: string;
  textBody?: string;

  isUnread: boolean;
  isStarred: boolean;
  hasAttachment?: boolean;
  
  // Semantic search similarity score (0-1, higher = more similar)
  similarityScore?: number;
  
  // WEEK 4: Dynamic Kanban fields
  cachedColumnId?: string;
  cachedColumnName?: string;
  summary?: string;
  isPendingSync?: boolean;
}

export interface Header {
  name: string;
  value: string;
}

export interface Body {
  size: number;
  data?: string; // Trường này có thể không tồn tại ở level cao nhất hoặc chứa base64 string
}

export interface Payload {
  partId: string;
  mimeType: string;
  filename: string;
  headers: Header[];
  body: Body;
  parts?: Payload[]; // Cấu trúc đệ quy: một phần (part) có thể chứa nhiều phần con
}

export interface RawMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: Payload;
}

export interface EmailData {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  bcc: string;
  date: string;
  messageId: string;
  htmlBody: string;
  textBody: string;
  attachments: any[]; // Mảng rỗng trong data mẫu, thường sẽ là object chứa attachmentId
  sizeEstimate: number;
  historyId: string;
  internalDate: string; // Lưu ý: Trong JSON là chuỗi (string), dù giá trị giống số
  raw: RawMessage;
}

export interface NavItem {
  title: string;
  path: string;
  // input className
  icon: React.ComponentType<{ className?: string }>;
  isActive?: boolean;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}
