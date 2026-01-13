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

## 🔧 Bước 2: Tạo Atlas Vector Search Index

### 2.1. Login vào MongoDB Atlas

1. Truy cập: https://cloud.mongodb.com
2. Chọn cluster của bạn
3. Click tab **"Atlas Search"** (bên cạnh "Collections")

### 2.2. Create Search Index

1. Click **"Create Search Index"**
2. Chọn **"JSON Editor"** (không dùng Visual Editor)
3. Paste JSON config sau:

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "embedding": {
        "type": "knnVector",
        "dimensions": 768,
        "similarity": "cosine"
      },
      "userId": {
        "type": "token"
      },
      "receivedDate": {
        "type": "date"
      },
      "from": {
        "type": "string"
      },
      "subject": {
        "type": "string"
      }
    }
  }
}
```

### 2.3. Configure Index Details

- **Index Name**: `vector_search_index` (QUAN TRỌNG: phải đúng tên này)
- **Database**: Tên database của bạn (vd: `email-customize-db`)
- **Collection**: `emailmetadatas`

### 2.4. Create & Wait

- Click **"Create Search Index"**
- ⏳ Đợi 5-10 phút để index build
- ✅ Status chuyển từ "Building" → "Active"

---

## 📝 Giải thích Config

### Field: `embedding`

```json
{
  "type": "knnVector",           // K-Nearest Neighbors Vector Search
  "dimensions": 768,             // Gemini embedding size
  "similarity": "cosine"         // Cosine similarity (best for text)
}
```

**Why cosine similarity?**
- ✅ Normalized vectors (không bị ảnh hưởng bởi độ dài document)
- ✅ Tốt cho text embeddings
- ✅ Range: -1 đến 1 (1 = giống nhau, 0 = không liên quan)

### Field: `userId`

```json
{
  "type": "token"                // Exact match, không tokenize
}
```

**🔥 CỰC QUAN TRỌNG:**
- Prevent data leakage giữa users
- Filter trong `$vectorSearch` pipeline
- Nếu thiếu → User A có thể search emails của User B!

### Fields: `receivedDate`, `from`, `subject`

```json
{
  "type": "date"    // For date range filters
},
{
  "type": "string"  // For text filters
}
```

**Dùng cho Advanced Filters** (future):
- Search trong khoảng thời gian
- Filter theo sender
- Combined with semantic search

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

### Problem 1: "Index not found"

**Nguyên nhân:**
- Index name sai (phải là `vector_search_index`)
- Index chưa build xong (status != "Active")
- Database/collection name sai

**Giải pháp:**
1. Vào Atlas → Atlas Search → Kiểm tra index name
2. Đảm bảo status = "Active"
3. Sửa code nếu cần:
   ```typescript
   $vectorSearch: {
     index: 'vector_search_index',  // ← Phải match với tên trên Atlas
   }
   ```

### Problem 2: "Dimension mismatch"

**Error:**
```
Vector search failed: dimensions mismatch (expected 768, got 1536)
```

**Nguyên nhân:**
- Index config dùng sai dimensions
- Hoặc code đổi model nhưng không update index

**Giải pháp:**
1. Delete index cũ trên Atlas
2. Tạo lại với `"dimensions": 768`
3. Re-index emails

### Problem 3: Vector Search không nhanh hơn

**Nguyên nhân:**
- Dataset quá nhỏ (< 1000 emails) → Linear search vẫn nhanh
- Index không được warm-up

**Giải pháp:**
- Index thêm emails (recommend > 5000)
- Chạy vài queries để warm-up

### Problem 4: Kết quả không chính xác

**Nguyên nhân:**
- Threshold quá thấp/cao
- Text cleaning không đủ tốt

**Giải pháp:**
1. Tăng threshold từ 0.5 → 0.6
2. Kiểm tra `embeddingText` có clean không:
   ```typescript
   const textForEmbedding = `From: ${email.from}
   Subject: ${email.subject}
   ${email.textBody || email.snippet}`
     .replace(/<[^>]*>/g, '')  // Remove HTML
     .replace(/\s+/g, ' ')     // Normalize whitespace
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
