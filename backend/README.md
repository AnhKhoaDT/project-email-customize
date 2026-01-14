# Mail Backend (NestJS) — Mock API for React Email App

This repository contains a minimal NestJS backend scaffold for the React authentication + email dashboard assignment. It provides:

- Authentication endpoints (email/password login, Google token exchange, refresh, logout)
- Mock mail API endpoints (mailboxes, mailbox emails, email detail) returning static JSON

Note: This backend is intentionally simple and uses an in-memory store for refresh tokens and a hard-coded demo user. It's intended to be used for local development with the React frontend (which is separate).

Quick start

1. Install dependencies:

```bash
cd backend
npm install
```

2. Development (watch) server using Nest CLI:

```bash
# shorthand: runs dev server on port 5000
npm run dev

# or the longer form (uses NODE_ENV=development and watch)
npm run start:dev
```

3. Build for production:

```bash
npm run build
```

4. Run the built app:

```bash
npm start
```

5. Extra: start in debug mode (inspect):

```bash
npm run start:debug
```

## 🌱 Database Seeding (NEW!)

To populate the database with sample data for testing:

```bash
# Make sure MongoDB is running first
npm run seed
```

This will create:
- **3 sample users** (demo@example.com, alice@example.com, bob@example.com)
- **45 sample emails** (15 per user, distributed across Inbox, Sent, Drafts, Spam, etc.)
- **Kanban configurations** (default 4-column board for each user)

**Sample login credentials:**
- Email: `demo@example.com`
- Password: `Demo123!`

**Troubleshooting:** If you get MongoDB connection errors, see `SEED_SETUP.md` for detailed setup instructions.

**Full documentation:** See `src/seed/README.md` for customization options and advanced usage.

## 🤖 Auto-Indexing for Semantic Search

The backend automatically indexes emails for semantic search without manual intervention. This system runs in the background and ensures your emails are always searchable.

### How It Works

**Automatic Triggers:**
1. **On Login**: Queues 100 most recent emails (HIGH priority)
2. **On Email Moved**: Queues moved email (NORMAL priority)

**Processing:**
- Background service processes 10 emails every 5 seconds
- Checks if email already indexed (idempotency)
- Strips HTML, truncates to 1000 chars (cost optimization)
- Generates embedding via Gemini AI
- Stores in MongoDB with vector index

### Configuration

Located in `src/mail/auto-indexing.service.ts`:
```typescript
BATCH_SIZE = 10;            // Emails per batch
PROCESS_INTERVAL_MS = 5000; // Process every 5 seconds
MAX_QUEUE_SIZE = 1000;      // Prevent memory overflow
```

### Monitoring

**Check queue status:**
```bash
GET /search/index/stats
```

**Response:**
```json
{
  "queueSize": 45,
  "isProcessing": true,
  "stats": {
    "totalQueued": 1205,
    "totalProcessed": 1160,
    "totalSkipped": 320,
    "totalFailed": 5
  }
}
```

**Backend logs:**
```
[Auth] 🚀 Queueing emails for auto-indexing...
[AutoIndexingService] 📦 Processing batch of 10 emails...
[AutoIndexingService] ✅ Batch complete: 10 success, 0 failed
```

### Testing

Re-index emails after code changes:
```bash
# Verify current data quality
npx ts-node scripts/verify-email-data.ts

# Clear embeddings to force re-index
npx ts-node scripts/re-index-test-emails.ts
```

**Note:** Vector Search requires MongoDB Atlas index. See `docs/VECTOR_SEARCH_SETUP.md` for setup instructions.

## 🚀 Smart Hybrid Search

Fast autocomplete suggestions combining instant text search with AI-powered semantic understanding.

### Features

**Two-Phase Search System:**
1. **Typing Phase (<100ms)**: Instant autocomplete using MongoDB Atlas Search
   - Top Hits: Direct email matches (sender + subject)
   - Keywords: Topic suggestions extracted from email subjects
2. **Searching Phase (~500ms)**: AI semantic search when clicking keywords
   - Vector embeddings for understanding context
   - Finds related emails even without exact keyword matches

**Key Benefits:**
- ⚡ **10x faster** than old Gmail API-based suggestions (31-184ms vs 3-5s)
- 🎯 **Smart keyword extraction**: Shows concise topics instead of full subjects
- 🧠 **Semantic understanding**: "Bảng lương" finds "payslip", "salary report"
- 🇻🇳 **Vietnamese optimized**: Diacritics folding ("báo" = "bao")
- 📊 **Guaranteed minimum**: Always returns at least 3 suggestions
- 🔄 **Smart balancing**: Redistributes results when one category is empty

### Quick Start

**1. Create Atlas Autocomplete Index** (Required)
```bash
# Follow detailed guide
cat docs/ATLAS_AUTOCOMPLETE_INDEX_SETUP.md
```

**2. API Usage**
```bash
# Get hybrid suggestions
GET /search/hybrid-suggestions?prefix=meeting&limitTopHits=3&limitKeywords=8

# Response
{
  "topHits": [
    {
      "type": "email",
      "emailId": "abc123",
      "from": "john@example.com",
      "subject": "Meeting schedule",
      "score": 8.5
    }
  ],
  "keywords": [
    {
      "type": "keyword",
      "value": "Meeting schedule",
      "emailCount": 12,
      "category": "Meeting"
    }
  ],
  "totalResults": 6,
  "processingTimeMs": 87
}
```

**3. Frontend Integration**
```tsx
import { useHybridSearch } from '@/hooks/useHybridSearch';
import { HybridSearchDropdown } from '@/components/search/HybridSearchDropdown';

const { suggestions, handleTopHitClick, handleKeywordClick } = useHybridSearch();
```

### Architecture

**Backend Services:**
- `HybridSearchService`: Parallel Promise.all execution for autocomplete + keywords
- `extractKeywordsFromSubject()`: 4 extraction strategies (acronyms, capitalized phrases, n-grams)
- Smart balancing: Guarantees min 3 suggestions by redistributing extra results

**MongoDB Atlas Indices:**
- **Autocomplete Index** (`autocomplete_search_index`): edgeGram(2-15), foldDiacritics
- **Vector Search Index** (`vector_search_index`): 768-dim embeddings, cosine similarity

**Frontend Components:**
- `useHybridSearch`: Debounced (150ms), abort controller for request cancellation
- `HybridSearchDropdown`: Split UI - Top Hits (navigate) vs Keywords (semantic search)

### Performance Optimizations

**Achieved Targets:**
- Autocomplete: 31-184ms (Target: <200ms) ✅
- Minimum suggestions: 3 guaranteed ✅
- Maximum suggestions: 11 (3 top hits + 8 keywords)

**Optimization Techniques:**
1. NO OpenAI calls during typing phase (only Atlas Search)
2. Reduced $limit: 100 → 50 emails for keyword extraction
3. Simplified regex: Moved from MongoDB to JavaScript layer
4. Connection pooling: Avoid cold starts
5. Parallel execution: Promise.all for top hits + keywords

**Regional Performance:**
- Singapore (ap-southeast-1): 50-150ms ✅
- US East (us-east-1): 300-500ms ⚠️
- Recommendation: Use Singapore region for production

### Documentation

- `docs/ATLAS_AUTOCOMPLETE_INDEX_SETUP.md` - Index setup guide (JSON config)

### Migration Path

**Current Status:** ✅ In Production
- Backend: `/search/hybrid-suggestions` endpoint active
- Frontend: Using `getHybridSuggestions()` in MailBox component
- Auth persistence: Stable with localStorage
- Smart balancing: Min 3 suggestions guaranteed
- Performance: 31-184ms (average ~100ms)

**Completed Migration:**
1. ✅ Created Atlas Autocomplete Index
2. ✅ Implemented HybridSearchService with keyword extraction
3. ✅ Integrated frontend components (useHybridSearch hook)
4. ✅ Replaced old SearchSuggestionsService
5. ✅ Performance optimized (<200ms target achieved)

**Deprecated Endpoints:**
- `GET /search/suggestions` (Old Gmail API-based - 3-5s response time)

### Testing

```bash
# Test autocomplete speed
curl -H "Authorization: Bearer <token>" \
  "http://localhost:5000/search/hybrid-suggestions?prefix=meeting"

# Expected: processingTimeMs < 200ms

# Test keyword extraction
# Input: "ba" → Should return "Báo cáo tài chính", "Bảo hiểm" keywords

# Test semantic search
# Click keyword "Bảng lương" → Should find "payslip", "salary report"
```



Environment variables

- `NODE_ENV`: controls environment behavior. The project enables CORS only when `NODE_ENV` is not `production` (so CORS is enabled for `development` by default).
- `PORT`: override the port the server listens on (default `5000`). Example: `PORT=5000 npm run start:dev`.

Example .env

Create a `.env` file in `backend/` for local development. A template is provided as `.env.example` — copy it and fill secrets before running:

```bash
cd backend
cp .env.example .env
# edit .env to set secrets
```

Important variables:

- `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET` — JWT secrets used to sign tokens.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — only needed if you implement real Google OAuth verification.

Auth endpoints

- `POST /auth/login` { email, password } => { accessToken, refreshToken, user }
  - Demo credentials: `demo@demo.com` / `demo123`
- `POST /auth/google` { email, name } => exchange Google payload for app tokens (mock)
- `POST /auth/refresh` { refreshToken } => { accessToken }
- `POST /auth/logout` { refreshToken } => { ok: true }

Mail endpoints (protected — include `Authorization: Bearer <accessToken>`)

- `GET /mailboxes` => list of mailboxes
- `GET /mailboxes/:id/emails?page=1` => paginated email list
- `GET /emails/:id` => email detail

Token handling notes

- Access token: short-lived JWT (15m). Stored in-memory by front-end (recommended) during session.
- Refresh token: longer-lived JWT (7d). In this mock server it's returned to the client and the server stores it in-memory. For production consider HttpOnly cookies for refresh tokens.

Next steps

- Implement the React frontend to consume these endpoints and handle token storage, refresh logic, and the 3-column dashboard.
- Replace the mock Google exchange with real OAuth verification if using real Google Sign-In.
