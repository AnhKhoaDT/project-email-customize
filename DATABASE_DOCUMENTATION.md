# 📊 Database Documentation - Mail Project

**Database Type**: MongoDB  
**ORM**: Mongoose (NestJS)  
**Last Updated**: 2026-01-19

---

## 📑 Table of Contents
1. [Overview](#overview)
2. [Collections](#collections)
   - [Users](#1-users)
   - [EmailMetadata](#2-emailmetadata)
   - [KanbanConfig](#3-kanbanconfig)
   - [GmailSyncState](#4-gmailsyncstate)
   - [SearchSuggestionCache](#5-searchsuggestioncache)
   - [Sessions](#6-sessions)
3. [Relationships](#relationships)
4. [Indexes](#indexes)
5. [Data Flow](#data-flow)

---

## Overview

Hệ thống sử dụng **6 collections** chính trong MongoDB để quản lý:
- **User authentication & profiles**
- **Email metadata & Kanban organization**
- **Gmail synchronization state**
- **Search optimization**
- **Session management**

---

## Collections

### 1. **Users**
**Collection Name**: `users`  
**Purpose**: Lưu trữ thông tin người dùng và trạng thái authentication

#### Fields

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✅ | ✅ | Auto | MongoDB document ID |
| `email` | String | ✅ | ✅ | - | Email đăng nhập (unique) |
| `name` | String | ✅ | ❌ | - | Tên hiển thị |
| `passwordHash` | String | ✅ | ❌ | - | Bcrypt hashed password |
| `phone` | String | ❌ | ❌ | - | Số điện thoại |
| `address` | String | ❌ | ❌ | - | Địa chỉ |
| `dateOfBirth` | Date | ❌ | ❌ | - | Ngày sinh |
| `googleRefreshToken` | String | ❌ | ❌ | - | OAuth2 refresh token từ Google |
| `lastHistoryId` | String | ❌ | ❌ | - | Gmail History API anchor (incremental sync) |
| `isSemanticSearchIndexed` | Boolean | ❌ | ❌ | `false` | Đã index emails cho semantic search chưa |
| `lastIndexedAt` | Date | ❌ | ❌ | - | Timestamp lần index gần nhất |
| `createdAt` | Date | ✅ | ❌ | Auto | Timestamp tạo (Mongoose) |
| `updatedAt` | Date | ✅ | ❌ | Auto | Timestamp cập nhật (Mongoose) |

#### Indexes
```javascript
// No explicit indexes defined (uses default _id index)
```

#### Relationships
- **1-to-Many** với `EmailMetadata` (userId)
- **1-to-1** với `KanbanConfig` (userId)
- **1-to-1** với `GmailSyncState` (userId)
- **1-to-Many** với `Sessions` (user reference)
- **1-to-Many** với `SearchSuggestionCache` (userId)

---

### 2. **EmailMetadata**
**Collection Name**: `emailmetadatas`  
**Purpose**: Lưu trữ metadata của emails, Kanban state, AI summaries, và embeddings

#### Fields

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✅ | ✅ | Auto | MongoDB document ID |
| `userId` | String | ✅ | ❌ | - | Reference đến User._id |
| `emailId` | String | ✅ | ❌ | - | Gmail message ID |
| **KANBAN FIELDS** |
| `kanbanColumnId` | String | ✅ | ❌ | - | **PRIMARY** - ID của Kanban column (source of truth) |
| `labelIds` | String[] | ❌ | ❌ | `[]` | **SYNCED** - Gmail label IDs (reflects kanban state) |
| `cachedColumnName` | String | ❌ | ❌ | - | **CACHE** - Tên column (denormalized) |
| `kanbanUpdatedAt` | Date | ❌ | ❌ | - | Timestamp khi move email giữa columns |
| `position` | Number | ❌ | ❌ | - | Vị trí trong column (0 = top) |
| `previousColumnId` | String | ❌ | ❌ | - | Column trước đó (cho undo) |
| **SYNC STATUS** |
| `syncStatus` | Object | ✅ | ❌ | `{state:'SYNCED', retryCount:0}` | Trạng thái sync với Gmail |
| `syncStatus.state` | String | ✅ | ❌ | `'SYNCED'` | `'SYNCED'` \| `'PENDING'` \| `'ERROR'` |
| `syncStatus.lastAttempt` | Date | ❌ | ❌ | - | Timestamp lần sync gần nhất |
| `syncStatus.errorMessage` | String | ❌ | ❌ | - | Error message nếu sync failed |
| `syncStatus.retryCount` | Number | ❌ | ❌ | `0` | Số lần retry |
| **AI SUMMARY** |
| `summary` | String | ❌ | ❌ | - | AI-generated summary (Gemini) |
| `summaryGeneratedAt` | Date | ❌ | ❌ | - | Timestamp tạo summary |
| `summaryModel` | String | ❌ | ❌ | - | Model name (e.g., "gemini-2.5-flash") |
| **SNOOZE** |
| `snoozedUntil` | Date | ❌ | ❌ | - | Thời gian wake up email |
| `isSnoozed` | Boolean | ✅ | ❌ | `false` | Email có đang bị snooze không |
| **CACHED EMAIL DATA** |
| `subject` | String | ❌ | ❌ | - | Email subject (cache) |
| `from` | String | ❌ | ❌ | - | Sender email (cache) |
| `threadId` | String | ❌ | ❌ | - | Gmail thread ID |
| `snippet` | String | ❌ | ❌ | - | Preview text |
| `receivedDate` | Date | ❌ | ❌ | - | Ngày nhận email |
| `hasAttachment` | Boolean | ❌ | ❌ | `false` | Có file đính kèm không |
| `attachments` | Object[] | ❌ | ❌ | `[]` | Danh sách attachments |
| **SEMANTIC SEARCH** |
| `embedding` | Number[] | ❌ | ❌ | - | Vector embedding (768 dimensions) |
| `embeddingText` | String | ❌ | ❌ | - | Text dùng để generate embedding |
| `embeddingGeneratedAt` | Date | ❌ | ❌ | - | Timestamp tạo embedding |
| **TIMESTAMPS** |
| `createdAt` | Date | ✅ | ❌ | Auto | Timestamp tạo (Mongoose) |
| `updatedAt` | Date | ✅ | ❌ | Auto | Timestamp cập nhật (Mongoose) |

#### Indexes
```javascript
// Compound unique index
{ userId: 1, emailId: 1 } // UNIQUE

// Snooze queries
{ isSnoozed: 1, snoozedUntil: 1 }

// Summary queries
{ userId: 1, summary: 1 }

// Kanban queries
{ userId: 1, kanbanColumnId: 1 }
{ userId: 1, kanbanColumnId: 1, position: 1 }

// Label queries
{ userId: 1, labelIds: 1 }

// Thread lookup
{ userId: 1, threadId: 1 }

// Sync status
{ 'syncStatus.state': 1, 'syncStatus.retryCount': 1 }

// Full-text search (weighted)
{
  subject: 'text',    // weight: 10
  from: 'text',       // weight: 5
  snippet: 'text'     // weight: 1
}

// Sync flag
{ isSynced: 1 }
```

#### Relationships
- **Many-to-1** với `Users` (userId)
- **Many-to-1** với `KanbanConfig.columns` (kanbanColumnId)

---

### 3. **KanbanConfig**
**Collection Name**: `kanbanconfigs`  
**Purpose**: Lưu cấu hình Kanban board của từng user

#### Main Document Fields

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✅ | ✅ | Auto | MongoDB document ID |
| `userId` | String | ✅ | ✅ | - | Reference đến User._id (UNIQUE) |
| `columns` | KanbanColumn[] | ✅ | ❌ | `[]` | Danh sách columns (embedded documents) |
| `showInbox` | Boolean | ❌ | ❌ | `false` | Hiển thị INBOX như source column |
| `defaultSort` | String | ❌ | ❌ | `'name'` | Field mặc định để sort |
| `syncStrategy` | String | ❌ | ❌ | `'optimistic'` | `'optimistic'` \| `'pessimistic'` |
| `syncTimeoutMs` | Number | ❌ | ❌ | `5000` | Timeout cho Gmail API calls (ms) |
| `enableAutoSync` | Boolean | ❌ | ❌ | `true` | Bật/tắt auto-sync với Gmail |
| `lastGlobalSync` | Date | ❌ | ❌ | - | Timestamp full sync gần nhất |
| `lastModified` | Date | ✅ | ❌ | - | Timestamp chỉnh sửa config |
| `createdAt` | Date | ✅ | ❌ | Auto | Timestamp tạo (Mongoose) |
| `updatedAt` | Date | ✅ | ❌ | Auto | Timestamp cập nhật (Mongoose) |

#### Embedded Document: KanbanColumn

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | String | ✅ | - | Unique column ID (e.g., "col_1") |
| `name` | String | ✅ | - | Display name (e.g., "To Do") |
| `order` | Number | ✅ | - | Display order (0, 1, 2, ...) |
| `gmailLabel` | String | ❌ | - | Gmail label ID để sync (e.g., "STARRED") |
| `gmailLabelName` | String | ❌ | - | Friendly name của Gmail label |
| `mappingType` | String | ❌ | `'label'` | `'label'` \| `'search'` \| `'custom'` |
| `searchQuery` | String | ❌ | - | Query nếu mappingType = 'search' |
| `autoArchive` | Boolean | ❌ | `false` | Tự động archive khi move vào |
| `removeInboxLabel` | Boolean | ❌ | `false` | Tự động remove INBOX label |
| `color` | String | ❌ | - | Màu UI (hex code) |
| `isVisible` | Boolean | ❌ | `true` | Column có visible không |
| `emailCount` | Number | ❌ | `0` | Cache số lượng emails |
| `lastSyncedAt` | Date | ❌ | - | Timestamp sync gần nhất |
| `hasLabelError` | Boolean | ❌ | `false` | Gmail label bị deleted/invalid |
| `labelErrorMessage` | String | ❌ | - | Error message từ Gmail API |
| `labelErrorDetectedAt` | Date | ❌ | - | Timestamp phát hiện error |

#### Constraints
```javascript
// DB CONSTRAINT 1: No Duplicate Gmail Labels
// Không được có 2 columns cùng gmailLabel

// DB CONSTRAINT 2: No Duplicate Column Names
// Không được có 2 columns cùng tên

// DB CONSTRAINT 3: No Duplicate Column IDs
// Không được có 2 columns cùng ID
```

#### Indexes
```javascript
// User lookup
{ userId: 1 }

// Label lookup
{ userId: 1, 'columns.gmailLabel': 1 }

// Timestamp queries
{ lastGlobalSync: 1 }
```

#### Relationships
- **1-to-1** với `Users` (userId)
- **1-to-Many** với `EmailMetadata` (columns[].id → kanbanColumnId)

---

### 4. **GmailSyncState**
**Collection Name**: `gmailsyncstates`  
**Purpose**: Track Gmail sync state cho incremental sync

#### Fields

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✅ | ✅ | Auto | MongoDB document ID |
| `userId` | String | ✅ | ✅ | - | Reference đến User._id (UNIQUE) |
| `lastHistoryId` | String | ✅ | ❌ | - | Gmail History API ID |
| `lastSyncAt` | Date | ✅ | ❌ | - | Timestamp lần sync gần nhất |
| `isActive` | Boolean | ❌ | ❌ | `true` | Enable/disable sync cho user |
| `syncCount` | Number | ❌ | ❌ | `0` | Tổng số lần sync |
| `errorCount` | Number | ❌ | ❌ | `0` | Số lỗi liên tiếp |
| `lastError` | String | ❌ | ❌ | - | Error message gần nhất |
| `lastErrorAt` | Date | ❌ | ❌ | - | Timestamp lỗi gần nhất |
| `syncType` | String | ❌ | ❌ | `'history'` | `'history'` \| `'full'` |
| `createdAt` | Date | ✅ | ❌ | Auto | Timestamp tạo (Mongoose) |
| `updatedAt` | Date | ✅ | ❌ | Auto | Timestamp cập nhật (Mongoose) |

#### Indexes
```javascript
// User lookup (unique)
{ userId: 1 } // UNIQUE

// Timestamp queries
{ lastSyncAt: 1 }

// Active sync queries
{ isActive: 1 }
```

#### Relationships
- **1-to-1** với `Users` (userId)

---

### 5. **SearchSuggestionCache**
**Collection Name**: `searchsuggestioncaches`  
**Purpose**: Cache search suggestions với TTL auto-expiration

#### Fields

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✅ | ✅ | Auto | MongoDB document ID |
| `userId` | String | ✅ | ❌ | - | Reference đến User._id |
| `prefix` | String | ✅ | ❌ | - | Search prefix (e.g., "meet") |
| `suggestions` | String[] | ✅ | ❌ | - | Danh sách suggestions |
| `type` | String | ❌ | ❌ | `'both'` | `'sender'` \| `'subject'` \| `'both'` |
| `createdAt` | Date | ❌ | ❌ | `Date.now()` | **TTL Index**: Auto-delete sau 1 giờ |
| `updatedAt` | Date | ❌ | ❌ | Auto | Timestamp cập nhật (Mongoose) |

#### Indexes
```javascript
// Compound unique index
{ userId: 1, prefix: 1 } // UNIQUE

// TTL Index (auto-delete after 3600 seconds)
{ createdAt: 1 } // expires: 3600
```

#### Relationships
- **Many-to-1** với `Users` (userId)

---

### 6. **Sessions**
**Collection Name**: `sessions`  
**Purpose**: Quản lý user sessions (JWT tokens)

#### Fields

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✅ | ✅ | Auto | MongoDB document ID |
| `token` | String | ✅ | ❌ | - | JWT token string |
| `user` | ObjectId | ✅ | ❌ | - | **Reference** đến Users._id |
| `expiresAt` | Date | ❌ | ❌ | - | Thời gian hết hạn token |
| `revoked` | Boolean | ❌ | ❌ | `false` | Token đã bị revoke chưa |
| `createdAt` | Date | ✅ | ❌ | Auto | Timestamp tạo (Mongoose) |
| `updatedAt` | Date | ✅ | ❌ | Auto | Timestamp cập nhật (Mongoose) |

#### Indexes
```javascript
// No explicit indexes defined
```

#### Relationships
- **Many-to-1** với `Users` (user reference)

---

## Relationships

### Entity Relationship Diagram

```
┌─────────────┐
│   Users     │
│  (users)    │
└──────┬──────┘
       │
       │ 1:1
       ├──────────────────────────────┐
       │                              │
       │ 1:Many                       │ 1:1
       ├──────────────┐               ├──────────────────┐
       │              │               │                  │
       ▼              ▼               ▼                  ▼
┌─────────────┐ ┌─────────────┐ ┌──────────────┐ ┌─────────────┐
│EmailMetadata│ │  Sessions   │ │KanbanConfig  │ │GmailSyncState│
│(emailmeta-  │ │ (sessions)  │ │(kanbanconfigs│ │(gmailsync-  │
│  datas)     │ │             │ │)             │ │  states)    │
└──────┬──────┘ └─────────────┘ └──────┬───────┘ └─────────────┘
       │                               │
       │ Many:1                        │ 1:Many
       │         ┌─────────────────────┘
       │         │
       │         ▼
       │    ┌──────────────┐
       │    │KanbanColumn  │
       └───▶│ (embedded)   │
            └──────────────┘

       │ 1:Many
       ├──────────────────┐
       │                  │
       ▼                  │
┌─────────────────────┐  │
│SearchSuggestionCache│  │
│(searchsuggestion-   │  │
│      caches)        │  │
└─────────────────────┘  │
```

### Relationship Details

| Parent | Child | Type | Foreign Key | Description |
|--------|-------|------|-------------|-------------|
| Users | EmailMetadata | 1:Many | `userId` | Một user có nhiều emails |
| Users | KanbanConfig | 1:1 | `userId` | Một user có một Kanban config |
| Users | GmailSyncState | 1:1 | `userId` | Một user có một sync state |
| Users | Sessions | 1:Many | `user` (ObjectId ref) | Một user có nhiều sessions |
| Users | SearchSuggestionCache | 1:Many | `userId` | Một user có nhiều cached suggestions |
| KanbanConfig | EmailMetadata | 1:Many | `columns[].id` → `kanbanColumnId` | Một column chứa nhiều emails |

---

## Indexes

### Performance Optimization

#### EmailMetadata (Most Critical)
- **Compound Unique**: `{userId, emailId}` - Đảm bảo unique emails per user
- **Kanban Queries**: `{userId, kanbanColumnId, position}` - Fast column queries
- **Full-Text Search**: Weighted text index trên `subject`, `from`, `snippet`
- **Semantic Search**: Sử dụng `embedding` field với MongoDB Atlas Vector Search

#### KanbanConfig
- **User Lookup**: `{userId}` - Fast config retrieval
- **Label Mapping**: `{userId, 'columns.gmailLabel'}` - Quick label-to-column mapping

#### SearchSuggestionCache
- **TTL Index**: Auto-delete sau 1 giờ để giữ cache fresh
- **Compound Unique**: `{userId, prefix}` - Prevent duplicate cache entries

---

## Data Flow

### 1. Email Sync Flow
```
Gmail API → GmailSyncService → EmailMetadata
                              ↓
                        KanbanConfigService
                              ↓
                        Assign kanbanColumnId
                              ↓
                        Sync labelIds to Gmail
```

### 2. Kanban Move Flow
```
User moves email → Update kanbanColumnId
                         ↓
                   Map to Gmail labels
                         ↓
                   Sync to Gmail API
                         ↓
                   Update syncStatus
```

### 3. Search Flow
```
User types → Check SearchSuggestionCache
                    ↓
              If miss → Query EmailMetadata
                              ↓
                        Cache results (TTL: 1h)
                              ↓
                        Return suggestions
```

### 4. Semantic Search Flow
```
User query → Generate embedding (Gemini)
                    ↓
              MongoDB Atlas Vector Search
                    ↓
              Find similar embeddings
                    ↓
              Return ranked results
```

---

## Notes

### Data Consistency
- **Optimistic Updates**: UI updates trước, sync sau
- **Retry Mechanism**: Auto-retry failed syncs (max 5 lần)
- **Conflict Resolution**: Gmail labels là source of truth khi conflict

### Performance
- **Denormalization**: `cachedColumnName` để tránh joins
- **Caching**: Search suggestions, email counts
- **Batch Operations**: Sync emails theo batch (20 emails/batch)

### Security
- **Password**: Bcrypt hashed (10 rounds)
- **Tokens**: JWT với expiration
- **API Keys**: Google OAuth2 refresh tokens encrypted

---

**End of Database Documentation**
