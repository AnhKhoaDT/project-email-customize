# MongoDB Atlas Vector Search Setup Guide

## 📋 Overview

Hướng dẫn cấu hình MongoDB Atlas Vector Search để tăng tốc semantic search từ **O(n) linear search** lên **O(log n) vector search**.

### Performance Comparison

| Metric | Linear Search (Hiện tại) | Vector Search (Sau setup) |
|--------|-------------------------|---------------------------|
| **Complexity** | O(n) | O(log n) |
| **1,000 emails** | ~200-500ms | ~10-30ms |
| **10,000 emails** | ~2-5s | ~20-50ms |
| **100,000 emails** | ~20-50s | ~50-100ms |
| **Scalability** | ❌ Poor | ✅ Excellent |

---

## 🎯 Bước 1: Kiểm tra Vector Dimensions

Code hiện tại đang dùng **Gemini text-embedding-004** model:

```typescript
// ai.service.ts
const embeddingModel = this.genAI.getGenerativeModel({ 
  model: 'text-embedding-004' 
});
```

**Gemini text-embedding-004 specs:**
- ✅ **Dimensions**: **768** (không phải 1536 như OpenAI)
- ✅ **Max input**: 2048 tokens (~8000 characters)
- ✅ **Similarity**: Cosine similarity
- ✅ **Language**: Multilingual (Vietnamese supported)

---

## 🔧 Bước 2: Tạo Vector Search Index

### 2.1. Login vào MongoDB Atlas

1. Truy cập: https://cloud.mongodb.com
2. Chọn cluster của bạn
3. Click tab **"Atlas Search"** → Hoặc vào **Database** → Click **"Create Index"**

### 2.2. Chọn Vector Search (QUAN TRỌNG!)

**⚠️ KHÔNG CHỌN "Atlas Search"**

1. Click **"Create Search Index"**
2. **Chọn "Vector Search"** (màu xanh lá)
   - ❌ KHÔNG chọn "Atlas Search" (cho full-text search)
   - ✅ Chọn "Vector Search" - For semantic search and AI applications
3. Click **"Next"**

### 2.3. Chọn JSON Editor

1. Chọn **"JSON Editor"** (không dùng Visual Editor)
2. Paste JSON config sau:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "userId"
    }
  ]
}
```

### 2.4. Configure Index Details

**Thông tin cần điền:**
- **Index Name**: `vector_search_index` ⚠️ **QUAN TRỌNG: phải đúng tên này**
- **Database**: Tên database của bạn (ví dụ: `mail-your`)
- **Collection**: `emailmetadatas`

### 2.5. Create & Wait

- Click **"Create Vector Search Index"**
- ⏳ Đợi **2-5 phút** để index build (nhanh hơn Atlas Search)
- ✅ Status chuyển từ "Initial Sync" → "Active"

---

## 📝 Giải thích Config

### Cấu trúc JSON mới của Vector Search

**❗ LƯU Ý:** Vector Search dùng cấu trúc JSON khác với Atlas Search!

```json
{
  "fields": [           // ← Array of fields (khác với mappings.fields)
    {
      "type": "vector",         // ← Loại: vector search field
      "path": "embedding",      // ← Field name trong document
      "numDimensions": 768,     // ← Gemini embedding size
      "similarity": "cosine"    // ← Similarity metric
    },
    {
      "type": "filter",         // ← Loại: filter field (cho pre-filtering)
      "path": "userId"          // ← Field name để filter
    }
  ]
}
```

### Field 1: `embedding` (Vector Field)

```json
{
  "type": "vector",             // Vector search field
  "path": "embedding",          // Path to embedding array
  "numDimensions": 768,         // Gemini text-embedding-004 = 768 dimensions
  "similarity": "cosine"        // Cosine similarity (best for text)
}
```

**Similarity Options:**
- ✅ **`cosine`** - Recommended cho text embeddings (normalized, -1 to 1)
- `euclidean` - L2 distance (cho spatial data)
- `dotProduct` - Dot product (cho pre-normalized vectors)

**Why cosine?**
- Không bị ảnh hưởng bởi độ dài document
- Tốt nhất cho semantic text search
- Range: 1 = giống nhau, 0 = không liên quan, -1 = ngược nghĩa

### Field 2: `userId` (Filter Field)

```json
{
  "type": "filter",             // Pre-filter field (index cho filtering)
  "path": "userId"              // Field path trong document
}
```

**🔥 CỰC QUAN TRỌNG - Security:**
- Cho phép filter theo userId TRƯỚC KHI vector search
- Prevent data leakage giữa users
- ⚠️ Nếu thiếu → User A có thể search emails của User B!

**Cách hoạt động:**
```typescript
$vectorSearch: {
  index: 'vector_search_index',
  queryVector: [...],
  filter: {
    userId: userId  // ← Pre-filter bằng indexed field
  }
}
```

### Optional: Thêm Filter Fields (Tương lai)

Có thể thêm nhiều filter fields để advanced search:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "userId"
    },
    {
      "type": "filter",
      "path": "receivedDate"    // Filter theo date range
    },
    {
      "type": "filter",
      "path": "labelIds"        // Filter theo labels
    }
  ]
}
```

---

## 🧪 Bước 3: Test Vector Search

### 3.1. Build & Start Backend

```bash
cd backend
npm run build
npm run dev
```

### 3.2. Index Some Emails

```bash
curl -X POST http://localhost:5000/search/index \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100}'
```

**Expected output:**
```json
{
  "status": 200,
  "message": "Successfully indexed 100/100 emails",
  "data": {
    "total": 100,
    "success": 100,
    "failed": 0
  }
}
```

### 3.3. Perform Semantic Search

```bash
curl -X POST http://localhost:5000/search/semantic \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "meeting tomorrow",
    "limit": 10,
    "threshold": 0.5
  }'
```

**Expected output:**
```json
{
  "status": 200,
  "data": {
    "query": "meeting tomorrow",
    "results": [...],
    "totalResults": 8,
    "searchedEmails": 8,
    "method": "vectorSearch"  // ← Xác nhận đang dùng Vector Search
  }
}
```

### 3.4. Check Logs

```
[VectorSearch] Found 8 results for user 6789...
```

**Nếu thấy log này → Vector Search hoạt động!** ✅

**Nếu thấy:**
```
[SemanticSearch] Using linear search (slow) - Consider enabling Vector Search Index
```
→ ❌ Vector Search chưa hoạt động (kiểm tra lại index name)

---

## 🐛 Troubleshooting

### Problem 1: "Index not found" hoặc Fallback to Linear Search

**Error trong logs:**
```
[SemanticSearch] Vector search failed, falling back to linear search: ...
[SemanticSearch] Using linear search (slow) - Consider enabling Vector Search Index
```

**Nguyên nhân:**
- ❌ Index name sai (phải là `vector_search_index`)
- ❌ Index chưa build xong (status != "Active")
- ❌ Database/collection name sai
- ❌ Tạo nhầm Atlas Search thay vì Vector Search

**Giải pháp:**

**Bước 1:** Kiểm tra index trên Atlas
1. Vào Atlas → **Atlas Search** tab
2. Tìm index tên `vector_search_index`
3. Kiểm tra:
   - **Type**: Phải là **Vector Search** (không phải Atlas Search)
   - **Status**: Phải là **Active** (không phải Initial Sync)
   - **Database & Collection**: Đúng với project của bạn

**Bước 2:** Nếu index sai type → Xóa và tạo lại
1. Click **"Delete"** index cũ
2. Tạo lại theo hướng dẫn Bước 2 (nhớ chọn **Vector Search**)

**Bước 3:** Kiểm tra code
```typescript
// semantic-search.service.ts - line ~361
$vectorSearch: {
  index: 'vector_search_index',  // ← Phải match với tên trên Atlas
  path: 'embedding',
  queryVector: queryEmbedding,
  // ...
}
```

### Problem 2: "Dimension mismatch"

**Error:**
```
Vector search failed: vector dimension mismatch (expected 768, got 1536)
```

**Nguyên nhân:**
- Index config dùng sai `numDimensions`
- Code đổi model nhưng không update index

**Giải pháp:**

**Option 1:** Sửa index config (Recommended)
1. Delete index cũ trên Atlas
2. Tạo lại với đúng dimensions:
   ```json
   {
     "type": "vector",
     "path": "embedding",
     "numDimensions": 768,    // ← Gemini text-embedding-004
     "similarity": "cosine"
   }
   ```
3. Re-index emails

**Option 2:** Đổi model trong code (không khuyến nghị)
```typescript
// ai.service.ts
// Nếu muốn dùng OpenAI thay vì Gemini:
// numDimensions: 1536 (OpenAI text-embedding-ada-002)
```

### Problem 3: "userId filter not working" - Security Issue!

**Triệu chứng:**
- User A thấy emails của User B
- Results không được filter theo userId

**Nguyên nhân:**
- Thiếu filter field `userId` trong index config
- Filter syntax sai trong code

**Giải pháp:**

**Bước 1:** Kiểm tra index config có filter field
```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    {
      "type": "filter",      // ← PHẢI CÓ
      "path": "userId"       // ← Chính xác field name
    }
  ]
}
```

**Bước 2:** Kiểm tra code có filter
```typescript
// semantic-search.service.ts
$vectorSearch: {
  index: 'vector_search_index',
  path: 'embedding',
  queryVector: queryEmbedding,
  filter: {
    userId: userId  // ← PHẢI CÓ để security
  }
}
```

### Problem 4: "Slow performance despite Vector Search"

**Triệu chứng:**
- Vector Search đang hoạt động
- Nhưng vẫn chậm (~500ms+)

**Nguyên nhân:**
- `numCandidates` quá lớn
- Không dùng pre-filtering
- MongoDB Atlas cluster quá yếu (M0/M2)

**Giải pháp:**

**Tối ưu `numCandidates`:**
```typescript
$vectorSearch: {
  index: 'vector_search_index',
  path: 'embedding',
  queryVector: queryEmbedding,
  numCandidates: Math.min(limit * 10, 1000),  // ← Giảm nếu cần
  limit: limit,
  filter: { userId }
}
```

**Recommended values:**
- `limit = 10` → `numCandidates = 100`
- `limit = 20` → `numCandidates = 200`
- `limit = 50` → `numCandidates = 500`

**Rule of thumb:** `numCandidates = limit × 10` (hoặc × 5 nếu dataset lớn)

### Problem 5: Index Status stuck at "Initial Sync"

**Nguyên nhân:**
- Index đang build dữ liệu lần đầu
- Collection quá lớn

**Giải pháp:**
- ⏳ Đợi thêm (có thể mất 10-30 phút với collection lớn)
- Check Atlas notifications/logs
- Nếu > 1 giờ vẫn stuck → Contact MongoDB Support

---

## 📊 So sánh: Vector Search vs Atlas Search

| Feature | **Vector Search** ✅ | Atlas Search (Full-text) |
|---------|---------------------|-------------------------|
| **Use Case** | Semantic/AI search | Keyword search |
| **Config Type** | `{"fields": [{"type": "vector"}]}` | `{"mappings": {"fields": {}}}` |
| **Query Method** | `$vectorSearch` | `$search` |
| **Best For** | "Find similar emails" | "Find exact keywords" |
| **Index Fields** | `type: "vector"` + `type: "filter"` | `type: "string"`, `type: "token"` |
| **Similarity** | cosine/euclidean/dotProduct | N/A (text matching) |

**🔥 Quan trọng:** Đừng nhầm lẫn 2 loại index này! Vector Search ≠ Atlas Search.

---

## ✅ Checklist Hoàn Thành

- [ ] Chọn **Vector Search** (không phải Atlas Search)
- [ ] JSON config đúng format: `{"fields": [...]}`
- [ ] Index name: `vector_search_index`
- [ ] `numDimensions: 768` (Gemini)
- [ ] `similarity: "cosine"`
- [ ] Có filter field `userId` cho security
- [ ] Index status: **Active**
- [ ] Test semantic search → `method: "vectorSearch"` trong response
- [ ] Performance: < 100ms cho 10k+ emails

---

## 🚀 Next Steps (Tương lai)

### Advanced Filtering

Thêm filter fields để combine semantic + structured search:

```json
{
  "fields": [
    {"type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine"},
    {"type": "filter", "path": "userId"},
    {"type": "filter", "path": "receivedDate"},    // Date range
    {"type": "filter", "path": "labelIds"},        // By labels
    {"type": "filter", "path": "from"}             // By sender
  ]
}
```

**Query example:**
```typescript
$vectorSearch: {
  index: 'vector_search_index',
  path: 'embedding',
  queryVector: embedding,
  filter: {
    userId: userId,
    receivedDate: { $gte: new Date('2026-01-01') },
    labelIds: { $in: ['INBOX', 'IMPORTANT'] }
  }
}
```

### Hybrid Search

Combine vector search + full-text search:

1. Tạo thêm Atlas Search index (riêng biệt)
2. Run 2 queries song song
3. Merge & re-rank results

---

## 📚 References

- [MongoDB Vector Search Docs](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/)
- [Atlas Search vs Vector Search](https://www.mongodb.com/docs/atlas/atlas-search/vs-atlas-vector-search/)
- [Gemini Embeddings](https://ai.google.dev/gemini-api/docs/embeddings)
- [Cosine Similarity](https://en.wikipedia.org/wiki/Cosine_similarity)

---

**Cập nhật:** 13/01/2026  
**Version:** 2.0 (Updated for new Vector Search interface)
     .trim();
   ```

---

## 🚀 Performance Tips

### 1. Adjust `numCandidates`

```typescript
$vectorSearch: {
  numCandidates: limit * 10,  // Candidate pool
  limit: limit * 2,            // Results to return
}
```

**Rule of thumb:**
- Small dataset (< 10k): `numCandidates = limit * 10`
- Large dataset (> 100k): `numCandidates = limit * 20`
- More candidates = higher accuracy, slower search

### 2. Use Filters Wisely

```typescript
$vectorSearch: {
  filter: {
    userId: userId,                    // Required
    receivedDate: { $gte: lastWeek },  // Optional
  }
}
```

**Filters reduce search space → faster!**

### 3. Cache Query Embeddings

```typescript
// Cache frequently searched queries
const cachedEmbeddings = new Map();

async semanticSearch(userId, query) {
  let queryEmbedding = cachedEmbeddings.get(query);
  if (!queryEmbedding) {
    queryEmbedding = await this.generateEmbedding(query);
    cachedEmbeddings.set(query, queryEmbedding);
  }
  // ...
}
```

---

## 📊 Monitoring

### Check Index Usage

**Atlas UI:**
- Go to "Metrics" tab
- Look for "Atlas Search" metrics
- Monitor query latency & throughput

### Check Index Size

```javascript
// MongoDB Shell
db.emailmetadatas.aggregate([
  {
    $indexStats: {}
  }
])
```

---

## 🔄 Fallback Strategy

Code đã implement **automatic fallback** nếu Vector Search fail:

```typescript
if (useVectorSearch) {
  try {
    // Try Vector Search first
    return await this.vectorSearch(...);
  } catch (vectorErr) {
    console.warn('Vector search failed, falling back to linear search');
    // Fall through to linear search
  }
}
// Linear search as fallback
```

**Khi nào fallback xảy ra?**
- Index chưa được tạo
- Index đang build
- Atlas connection timeout
- Config sai

**Ưu điểm:**
- ✅ App vẫn hoạt động khi Vector Search down
- ✅ Smooth migration (không cần downtime)
- ✅ A/B testing dễ dàng

---

## ✅ Checklist

- [ ] Xác nhận Gemini model: `text-embedding-004` (768 dims)
- [ ] Tạo Atlas Search Index với tên `vector_search_index`
- [ ] Config dimensions = 768
- [ ] Config similarity = cosine
- [ ] Add userId filter field
- [ ] Wait for index status = Active
- [ ] Test với `POST /search/semantic`
- [ ] Verify log: `[VectorSearch] Found X results`
- [ ] Measure latency improvement
- [ ] Monitor Atlas Search metrics

---

## 📚 Resources

- [MongoDB Vector Search Docs](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/)
- [Gemini Embedding API](https://ai.google.dev/gemini-api/docs/embeddings)
- [Atlas Search Index Tutorial](https://www.mongodb.com/docs/atlas/atlas-search/tutorial/)

---

## 🎯 Next Steps

Sau khi Vector Search hoạt động:

1. **Phase 2: Advanced Filters**
   - Date range search
   - Multi-field search
   - Hybrid search (vector + keyword)

2. **Phase 3: Performance Tuning**
   - Query caching
   - Index optimization
   - Monitoring & alerting

3. **Phase 4: Scale**
   - Sharding strategy
   - Read replicas
   - Cross-region deployment
