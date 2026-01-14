# MongoDB Atlas Autocomplete Index Setup

## 📋 Overview

Hướng dẫn tạo **Autocomplete Search Index** trên MongoDB Atlas để hỗ trợ Smart Hybrid Search với tốc độ phản hồi <100ms.

---

## 🎯 Index Configuration

### Index Name
```
autocomplete_search_index
```

### Collection
```
emailmetadatas
```

### Index Definition (JSON)

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "userId": {
        "type": "string"
      },
      "from": {
        "type": "autocomplete",
        "analyzer": "lucene.standard",
        "tokenization": "edgeGram",
        "minGrams": 2,
        "maxGrams": 15,
        "foldDiacritics": true
      },
      "subject": {
        "type": "autocomplete",
        "analyzer": "lucene.standard",
        "tokenization": "edgeGram",
        "minGrams": 2,
        "maxGrams": 15,
        "foldDiacritics": true
      },
      "emailId": {
        "type": "string"
      },
      "threadId": {
        "type": "string"
      },
      "snippet": {
        "type": "string"
      },
      "receivedDate": {
        "type": "date"
      }
    }
  }
}
```

---

## 📝 Step-by-Step Setup

### Step 1: Access Atlas Search

1. Đăng nhập vào [MongoDB Atlas](https://cloud.mongodb.com)
2. Chọn cluster của bạn
3. Click tab **"Search"** (bên cạnh Collections)
4. Click **"Create Search Index"**

### Step 2: Choose Index Type

1. Select **"JSON Editor"**
2. Click **"Next"**

### Step 3: Configure Index

1. **Database:** Chọn database của bạn (ví dụ: `emailcustomize`)
2. **Collection:** Chọn `emailmetadatas`
3. **Index Name:** Nhập `autocomplete_search_index`
4. **Index Definition:** Copy-paste JSON config ở trên
5. Click **"Next"**

### Step 4: Review & Create

1. Review lại config
2. Click **"Create Search Index"**
3. Đợi index build (khoảng 1-5 phút tùy số lượng documents)

---

## ✅ Verify Index

### Check Index Status

1. Vào tab **"Search"**
2. Tìm index `autocomplete_search_index`
3. Status phải là **"Active"** (màu xanh)

### Test Query (Atlas UI)

```javascript
// Test trong Atlas Search Playground
[
  {
    $search: {
      index: "autocomplete_search_index",
      autocomplete: {
        query: "ba",
        path: "subject"
      }
    }
  },
  {
    $limit: 5
  },
  {
    $project: {
      subject: 1,
      from: 1,
      score: { $meta: "searchScore" }
    }
  }
]
```

**Expected Result:** Các emails có subject bắt đầu bằng "ba" (báo cáo, bảo hiểm, etc.)

---

## 🔧 Key Configuration Explained

### `edgeGram` (2-15)
- **Purpose:** Support prefix matching cho autocomplete
- **Example:** "ba" matches "báo cáo", "bảo hiểm", "bảng lương"
- **minGrams=2:** Minimum 2 characters để search (performance)
- **maxGrams=15:** Maximum token length

### `foldDiacritics: true`
- **Purpose:** Normalize Vietnamese diacritics
- **Example:** "bao cao" matches "báo cáo"
- **Benefit:** Users không cần gõ dấu

### `lucene.standard` Analyzer
- **Tokenization:** Whitespace + punctuation
- **Case:** Case-insensitive (automatic lowercase)
- **Special chars:** Strips punctuation

---

## 📊 Performance Expectations

| Database Size | Index Build Time | Index Size | Query Time |
|--------------|------------------|-----------|-----------|
| 1K emails | <1 min | ~5MB | <50ms |
| 10K emails | ~2 min | ~50MB | <80ms |
| 100K emails | ~5 min | ~500MB | <100ms |

---

## 🐛 Troubleshooting

### Issue 1: Index build failed
**Solution:** Check field types match, ensure collection has data

### Issue 2: No results returned
**Solution:** 
- Verify index status is "Active"
- Check `userId` filter is correct
- Test with simpler query (no filters)

### Issue 3: Slow query (>200ms)
**Solution:**
- Check index is being used (`explain()` in query)
- Reduce maxGrams if too large
- Add more specific filters (userId, date range)

---

## 🔄 Next Steps

After index is created and active:

1. ✅ Verify index status
2. ✅ Test sample queries in Atlas UI
3. ✅ Proceed to Backend API implementation
4. ✅ Monitor query performance in Atlas metrics

---

**Status:** ⏳ Waiting for Atlas index creation  
**ETA:** ~5 minutes for 100K emails  
**Next:** Implement HybridSearchService in backend
