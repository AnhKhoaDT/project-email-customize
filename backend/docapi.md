# API Doc — Frontend Integration (Mail Project)

Tài liệu này mô tả chi tiết các endpoint backend mà frontend (React SPA) cần gọi, cách xác thực, ví dụ `fetch`/`curl`, và lưu ý bảo mật. Viết bằng tiếng Việt để dễ theo dõi.

---
## Mục lục
- Tổng quan luồng OAuth
- Yêu cầu môi trường / CORS
- Endpoints và ví dụ
  - OAuth / Auth: `/auth/google`, `/auth/google/callback`, `/auth/refresh`, `/auth/logout`, `/auth/login` (local)
  - Users: `/users/register`, `/users/me`, `/users/:id`
  - Mail (Gmail proxy): `/mailboxes`, `/mailboxes/:id/emails`, `/emails/:id`
  - AI APIs: `/ai/summarize`, `/ai/batch-summarize`
  - Snooze APIs: `/emails/:id/snooze`, `/emails/:id/unsnooze`, `/snooze/list`
  - Search APIs: `/search/fuzzy`, `/search/semantic`, `/search/suggestions`, `/search/index`
  - Kanban APIs: `/kanban/columns`, `/emails/:id/move`, `/kanban/config`
- AI và Kanban APIs (Week 2 Features)
- Ví dụ mã frontend (`fetch`) để login, refresh, gọi API mail
- Lưu trữ token & hành vi khi đóng/mở app
- Lỗi thường gặp & cách xử lý

---
## 1) Tổng quan luồng OAuth (phiên bản hiện tại)
- Frontend mở `GET /auth/google` (một endpoint của backend). Backend redirect người dùng tới Google consent page với `redirect_uri` trỏ về callback backend (`/auth/google/callback`).
- Người dùng consent → Google redirect về backend với `?code=...`.
- Backend trao `code` đổi lấy Google tokens (access_token, refresh_token). Backend lưu `googleRefreshToken` vào `users` (DB) và tạo app session tokens (app access token + app refresh token). Backend lưu app refresh token vào collection `sessions` và đặt cookie HttpOnly `refreshToken` (domain = backend) rồi redirect về frontend với `?auth=success`.
- Frontend thấy `?auth=success` → gọi `POST /auth/refresh` với `credentials: 'include'` để backend đọc cookie và trả `accessToken` (JWT ngắn hạn). Frontend dùng `accessToken` để gọi API bảo vệ như `/users/me` và `/mailboxes`.

---
## 2) Yêu cầu môi trường / CORS
-- Biến môi trường quan trọng (backend):
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_CALLBACK_URL` (ví dụ `http://localhost:5000/auth/google/callback`) — used by `auth` endpoints
  - `GOOGLE_REDIRECT_URI` (ví dụ `http://localhost:5000/auth/google/callback`) — used by some mail sync services (legacy variable). It's safe to set both to the same value.
  - `FE_URL` (ví dụ `http://localhost:3000`)
  - `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`
  - `MONGODB_URI`
- Backend phải enable CORS cho origin frontend và `credentials: true`.
  - `app.enableCors({ origin: process.env.FE_URL, credentials: true })`
- Frontend khi gọi endpoint cần gửi cookie: `fetch(url, { credentials: 'include' })`.

---
## 3) Endpoints — chi tiết
Lưu ý: các URL mặc định dùng port backend 5000 (http://localhost:5000) và frontend 3000.

### Auth / OAuth
1) GET /auth/google
- Mục đích: entrypoint đơn giản — chuyển hướng trình duyệt tới Google consent.
- Frontend: chỉ cần `window.location.href = BACKEND + '/auth/google'`
- No JSON response — backend redirect tới Google.

2) GET /auth/google/url
- Mục đích: trả JSON `{ url }` (URL consent) nếu cần copy hoặc debug.
- Không cần auth.
- Ví dụ:
  - curl: `curl http://localhost:5000/auth/google/url`

3) GET /auth/google/callback
- Callback that Google calls with `?code=...`.
- Backend xử lý: exchange token, lưu `googleRefreshToken` trong `users`, tạo app session, set cookie HttpOnly `refreshToken`, redirect về FE `?auth=success`.
- Frontend không gọi trực tiếp (Google và backend thực hiện).

4) POST /auth/refresh
- Mục đích: đổi app refresh token (từ cookie hoặc body) lấy `accessToken` ngắn hạn.
- Auth: gửi cookie `refreshToken` tự động khi `credentials: 'include'`.
- Request body (tuỳ): `{ "refreshToken": "..." }` (không cần nếu cookie đã có)
- Response success: `200 { "accessToken": "<JWT>" }`
- Example curl (cookie-based):
  ```bash
  curl -v -X POST http://localhost:5000/auth/refresh --cookie "refreshToken=<value>" -H "Content-Type: application/json"
  ```
- Example fetch (recommended):
  ```js
  const res = await fetch(BACKEND + '/auth/refresh', { method: 'POST', credentials: 'include' });
  const j = await res.json(); // { accessToken }
  ```

5) POST /auth/logout
- Mục đích: revoke app session & clear cookie.
- Call with `credentials: 'include'` to clear cookie set by backend.
- Response: `{ ok: true }`.

6) POST /auth/login (local)
- Email/password login (if implemented). Returns `{ accessToken, refreshToken, user }`.

7) POST /auth/google (mock)
- For testing: exchange token/email mock.


### Users
1) POST /users/register
- Body: `{ name, email, password, phone?, address?, dateOfBirth? }`
- Creates user, returns user object.

2) GET /users/me
- Auth: `Authorization: Bearer <accessToken>` in header.
- Response: user profile JSON.

3) PUT /users/me
- Auth required. Body: fields to update.

4) DELETE /users/me
- Auth required.


### Mail (Gmail proxy)
> All mail endpoints require `Authorization: Bearer <accessToken>` (app access token) in header.

#### Nhóm API Đọc dữ liệu (Data Retrieval)

1) **GET /mailboxes**
- **Mục đích**: Lấy danh sách các hộp thư hoặc nhãn (labels/folders) từ Gmail.
- **Auth**: Required (Bearer token)
- **Response**: Danh sách các labels với id, name, type, messageListVisibility, etc.
- **Example**:
  ```bash
  curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:5000/mailboxes
  ```
  ```js
  const res = await fetch(BACKEND + '/mailboxes', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const labels = await res.json();
  ```

2) **GET /mailboxes/:id/emails?page=1&limit=50&pageToken=...**
- **Mục đích**: Lấy danh sách email trong một hộp thư cụ thể, có hỗ trợ phân trang. **Backend tự động fetch chi tiết cho mỗi email.**
- **Auth**: Required (Bearer token)
- **Params**:
  - `:id` - Label ID (ví dụ: `INBOX`, `SENT`, `DRAFT`, hoặc custom label ID)
  - `page` (optional) - Số trang (hiện tại chưa được sử dụng, dùng pageToken thay thế)
  - `limit` (optional, default=50) - Số lượng email trên mỗi trang
  - `pageToken` (optional) - Token để lấy trang tiếp theo (từ response trước)
- **Response**: 
  ```json
  {
    "messages": [
      {
        "id": "19aba6e5873a9087",
        "threadId": "19aba6e5873a9087",
        "labelIds": ["UNREAD", "INBOX"],
        "snippet": "Email preview text...",
        "subject": "[JIRA] (KAN-26) API for measurement",
        "from": "Sender Name <sender@example.com>",
        "to": "Recipient <recipient@example.com>",
        "date": "Tue, 25 Nov 2025 09:53:04 +0000",
        "sizeEstimate": 14773,
        "internalDate": "1764064384000",
        "isUnread": true,
        "isStarred": false,
        "hasAttachment": false
      }
    ],
    "nextPageToken": "xyz123...",
    "resultSizeEstimate": 100
  }
  ```
- **Các trường quan trọng**:
  - `subject`: Tiêu đề email
  - `from`: Người gửi (tên + email)
  - `to`: Người nhận
  - `date`: Ngày gửi (human-readable)
  - `snippet`: Preview nội dung ngắn (~160 ký tự)
  - `isUnread`: Email chưa đọc hay chưa
  - `isStarred`: Email có gắn sao không
  - `hasAttachment`: Email có file đính kèm không
  - `labelIds`: Danh sách labels (INBOX, SENT, UNREAD, STARRED, etc.)
- **Lưu ý**: Backend tự động fetch metadata cho từng email nên response có thể hơi chậm với `limit` lớn. Khuyến nghị `limit=20-50`.
- **Example**:
  ```bash
  curl -H "Authorization: Bearer <ACCESS_TOKEN>" \
    "http://localhost:5000/mailboxes/INBOX/emails?limit=20"
  ```
  ```js
  const res = await fetch(BACKEND + '/mailboxes/INBOX/emails?limit=20&pageToken=xyz', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await res.json();
  
  // Hiển thị danh sách
  data.messages.forEach(email => {
    console.log(`${email.from}: ${email.subject}`);
    console.log(`Unread: ${email.isUnread}, Has attachment: ${email.hasAttachment}`);
  });
  ```

3) **GET /emails/:id**
- **Mục đích**: Lấy nội dung chi tiết của một email cụ thể (bao gồm body HTML/plain text, headers, attachments info).
- **Auth**: Required (Bearer token)
- **Params**: `:id` - Message ID
- **Response**: Parsed email object với các trường quan trọng:
  ```json
  {
    "id": "19abbacc4d99a7a4",
    "threadId": "19abbacc4d99a7a4",
    "labelIds": ["UNREAD", "INBOX"],
    "snippet": "Email preview text...",
    "subject": "[GitHub] Sudo email verification code",
    "from": "GitHub <noreply@github.com>",
    "to": "user@example.com",
    "cc": "",
    "bcc": "",
    "date": "Tue, 25 Nov 2025 07:40:52 -0800",
    "messageId": "<6925ce04db553_fc110080349@accountsecurityworker.mail>",
    "htmlBody": "<!DOCTYPE html>...",
    "textBody": "Hey, AnhKhoaDT! Here is your code...",
    "attachments": [
      {
        "filename": "document.pdf",
        "mimeType": "application/pdf",
        "attachmentId": "ANGjdJ...",
        "size": 12345
      }
    ],
    "sizeEstimate": 27959,
    "historyId": "37957",
    "internalDate": "1764085252000",
    "raw": { ... } // Original Gmail API response nếu cần
  }
  ```
- **Lưu ý**: 
  - `htmlBody`: Nội dung HTML đã decode, sẵn sàng hiển thị trong iframe hoặc dangerouslySetInnerHTML
  - `textBody`: Nội dung plain text đã decode (fallback nếu không có HTML)
  - `attachments`: Danh sách file đính kèm với attachmentId để download
  - Backend tự động parse và decode Base64URL của Gmail
- **Example**:
  ```bash
  curl -H "Authorization: Bearer <ACCESS_TOKEN>" \
    http://localhost:5000/emails/<MESSAGE_ID>
  ```
  ```js
  const res = await fetch(BACKEND + '/emails/' + messageId, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const email = await res.json();
  
  // Hiển thị HTML body
  // <div dangerouslySetInnerHTML={{ __html: email.htmlBody }} />
  // hoặc fallback sang text
  // <pre>{email.textBody}</pre>
  ```

4) **GET /attachments/:messageId/:attachmentId**
- **Mục đích**: Tải hoặc stream file đính kèm về frontend.
- **Auth**: Required (Bearer token)
- **Params**: 
  - `:messageId` - ID của email chứa attachment
  - `:attachmentId` - ID của attachment (lấy từ email detail)
- **Response**: Binary stream của file đính kèm
- **Headers**: `Content-Type: application/octet-stream`
- **Example**:
  ```bash
  curl -H "Authorization: Bearer <ACCESS_TOKEN>" \
    http://localhost:5000/attachments/<MESSAGE_ID>/<ATTACHMENT_ID> \
    --output filename.pdf
  ```
  ```js
  // Download attachment
  const res = await fetch(BACKEND + `/attachments/${messageId}/${attachmentId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'filename.pdf';
  a.click();
  ```

#### Nhóm API Thao tác (Actions)

5) **POST /emails/send**
- **Mục đích**: Gửi một email mới.
- **Auth**: Required (Bearer token)
- **Body**:
  ```json
  {
    "to": ["recipient@example.com"],
    "cc": ["cc@example.com"],
    "bcc": ["bcc@example.com"],
    "subject": "Email subject",
    "body": "Email body content",
    "isHtml": true,
    "attachments": [
      {
        "filename": "document.pdf",
        "content": "base64EncodedContent",
        "contentType": "application/pdf"
      }
    ]
  }
  ```
- **Response**:
  ```json
  {
    "status": 200,
    "message": "Email sent successfully",
    "data": { "id": "...", "threadId": "...", "labelIds": [...] }
  }
  ```
- **Example**:
  ```bash
  curl -X POST -H "Authorization: Bearer <ACCESS_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{
      "to": ["test@example.com"],
      "subject": "Test Email",
      "body": "Hello from API",
      "isHtml": false
    }' \
    http://localhost:5000/emails/send
  ```
  ```js
  const res = await fetch(BACKEND + '/emails/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: ['recipient@example.com'],
      subject: 'Test Subject',
      body: '<h1>Hello</h1>',
      isHtml: true
    })
  });
  const result = await res.json();
  ```

6) **POST /emails/:id/reply**
- **Mục đích**: Trả lời một email.
- **Auth**: Required (Bearer token)
- **Params**: `:id` - Message ID của email cần reply
- **Body**:
  ```json
  {
    "body": "Reply message content",
    "isHtml": true,
    "attachments": [
      {
        "filename": "document.pdf",
        "content": "base64EncodedContent",
        "contentType": "application/pdf"
      }
    ]
  }
  ```
- **Response**:
  ```json
  {
    "status": 200,
    "message": "Reply sent successfully",
    "data": { "id": "...", "threadId": "...", "labelIds": [...] }
  }
  ```
- **Example**:
  ```bash
  curl -X POST -H "Authorization: Bearer <ACCESS_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{
      "body": "Thank you for your email",
      "isHtml": false
    }' \
    http://localhost:5000/emails/<MESSAGE_ID>/reply
  ```
  ```js
  const res = await fetch(BACKEND + `/emails/${messageId}/reply`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      body: 'Thanks for reaching out!',
      isHtml: false
    })
  });
  const result = await res.json();
  ```

7) **POST /emails/:id/modify**
- **Mục đích**: Thực hiện các thay đổi trạng thái như: đánh dấu đã đọc/chưa đọc, gắn sao, xóa, archive.
- **Auth**: Required (Bearer token)
- **Params**: `:id` - Message ID
- **Body**:
  ```json
  {
    "action": "markRead" | "markUnread" | "star" | "unstar" | "delete" | "archive" | "unarchive"
  }
  ```
- **Response**:
  ```json
  {
    "status": 200,
    "message": "Email modified successfully",
    "data": { "id": "...", "threadId": "...", "labelIds": [...] }
  }
  ```
- **Actions**:
  - `markRead`: Đánh dấu đã đọc (xóa label UNREAD)
  - `markUnread`: Đánh dấu chưa đọc (thêm label UNREAD)
  - `star`: Gắn sao (thêm label STARRED)
  - `unstar`: Gỡ sao (xóa label STARRED)
  - `delete`: Xóa email (chuyển vào TRASH)
  - `archive`: Archive email (xóa khỏi INBOX)
  - `unarchive`: Unarchive email (thêm lại vào INBOX)
- **Example**:
  ```bash
  curl -X POST -H "Authorization: Bearer <ACCESS_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{ "action": "markRead" }' \
    http://localhost:5000/emails/<MESSAGE_ID>/modify
  ```
  ```js
  const res = await fetch(BACKEND + `/emails/${messageId}/modify`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'star' })
  });
  const result = await res.json();
  ```

8) **POST /labels/:id/toggle**
- **Mục đích**: Gắn hoặc gỡ nhãn (label) cho một hoặc nhiều email (dành riêng cho Gmail).
- **Auth**: Required (Bearer token)
- **Params**: `:id` - Label ID
- **Body**:
  ```json
  {
    "action": "add" | "remove",
    "emailIds": ["messageId1", "messageId2", "..."]
  }
  ```
- **Response**:
  ```json
  {
    "status": 200,
    "message": "Label toggled successfully",
    "data": {}
  }
  ```
- **Example**:
  ```bash
  curl -X POST -H "Authorization: Bearer <ACCESS_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{
      "action": "add",
      "emailIds": ["msg1", "msg2"]
    }' \
    http://localhost:5000/labels/Label_123/toggle
  ```
  ```js
  const res = await fetch(BACKEND + `/labels/${labelId}/toggle`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'add',
      emailIds: [messageId1, messageId2]
    })
  });
  const result = await res.json();
  ```


---
## 4) AI và Kanban APIs (Week 2 Features)

### AI Summarization APIs

#### POST /ai/summarize
- **Mục đích**: Tạo tóm tắt AI cho một email đơn lẻ
- **Auth**: Required (Bearer token)
- **Body**:
  ```json
  {
    "emailId": "19aba6e5873a9087",
    "subject": "Meeting Notes",
    "snippet": "Email preview text..."
  }
  ```
- **Response**:
  ```json
  {
    "emailId": "19aba6e5873a9087",
    "summary": "Meeting scheduled for next Monday at 2 PM to discuss Q4 goals."
  }
  ```
- **Example**:
  ```js
  const res = await fetch(BACKEND + '/ai/summarize', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      emailId: email.id,
      subject: email.subject,
      snippet: email.snippet
    })
  });
  const data = await res.json();
  console.log(data.summary);
  ```

#### POST /ai/batch-summarize
- **Mục đích**: Tạo tóm tắt AI cho nhiều emails cùng lúc (batch processing)
- **Auth**: Required (Bearer token)
- **Body**:
  ```json
  {
    "emails": [
      {
        "id": "email1",
        "subject": "Meeting",
        "snippet": "..."
      },
      {
        "id": "email2",
        "subject": "Invoice",
        "snippet": "..."
      }
    ]
  }
  ```
- **Response**:
  ```json
  {
    "results": [
      {
        "emailId": "email1",
        "summary": "Summary text...",
        "status": "success"
      },
      {
        "emailId": "email2",
        "summary": "Summary text...",
        "status": "success"
      }
    ]
  }
  ```
- **Lưu ý**:
  - Backend sử dụng hybrid concurrency: 3 sequential batches × 5 parallel requests
  - Tối ưu cho rate limiting và cost
  - Graceful error handling cho từng email

### Snooze APIs

#### POST /emails/:id/snooze
- **Mục đích**: Snooze một email đến thời điểm cụ thể
- **Auth**: Required (Bearer token)
- **Params**: `:id` - Message ID
- **Body**:
  ```json
  {
    "threadId": "19aba6e5873a9087",
    "snoozedUntil": "2025-12-10T15:00:00.000Z",
    "currentStatus": "INBOX"
  }
  ```
- **Response**:
  ```json
  {
    "status": 200,
    "message": "Email snoozed successfully",
    "data": {
      "emailId": "19aba6e5873a9087",
      "threadId": "19aba6e5873a9087",
      "snoozedUntil": "2025-12-10T15:00:00.000Z",
      "originalStatus": "INBOX"
    }
  }
  ```
- **Example**:
  ```js
  const snoozedUntil = new Date(Date.now() + 5000).toISOString(); // 5 seconds
  const res = await fetch(BACKEND + `/emails/${emailId}/snooze`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      threadId: email.threadId,
      snoozedUntil,
      currentStatus: 'INBOX'
    })
  });
  ```

#### POST /emails/:id/unsnooze
- **Mục đích**: Hủy snooze và restore email ngay lập tức
- **Auth**: Required (Bearer token)
- **Params**: `:id` - Message ID
- **Body**:
  ```json
  {
    "threadId": "19aba6e5873a9087"
  }
  ```
- **Response**:
  ```json
  {
    "status": 200,
    "message": "Email unsnoozed successfully"
  }
  ```

#### GET /snooze/list
- **Mục đích**: Lấy danh sách tất cả emails đang snooze
- **Auth**: Required (Bearer token)
- **Response**:
  ```json
  {
    "snoozedEmails": [
      {
        "emailId": "email1",
        "threadId": "thread1",
        "snoozedUntil": "2025-12-10T15:00:00.000Z",
        "originalStatus": "INBOX"
      }
    ]
  }
  ```

### Search APIs

#### GET /search/fuzzy
- **Mục đích**: Tìm kiếm emails với fuzzy logic (typo tolerance + partial match)
- **Auth**: Required (Bearer token)
- **Query Parameters**:
  - `q` (required): Search query string
  - `limit` (optional): Số lượng kết quả (default: 20, max: 50)
  - `offset` (optional): Vị trí bắt đầu (default: 0)
  - `status` (optional): Lọc theo status (INBOX, TODO, DONE)
- **Rate Limit**: 20 requests/minute per user
- **Response**:
  ```json
  {
    "status": 200,
    "data": {
      "hits": [
        {
          "emailId": "19aba6e5873a9087",
          "threadId": "19aba6e5873a9087",
          "subject": "Instagram notification",
          "from": "Instagram <no-reply@instagram.com>",
          "snippet": "Your friend liked your photo...",
          "receivedDate": "2025-12-15T10:30:00.000Z",
          "status": "INBOX",
          "score": 0.95
        }
      ],
      "query": "In",
      "totalHits": 1,
      "offset": 0,
      "limit": 20,
      "processingTimeMs": 156
    }
  }
  ```
- **Search Features**:
  - Typo tolerance: "markting" tìm được "marketing"
  - Partial match: "In" tìm được "Instagram"
  - Weighted search: Subject (50%), Sender (30%), Snippet (20%)
  - Vietnamese support: "Nguy" tìm được "Nguyễn"
- **Example**:
  ```js
  const res = await fetch(BACKEND + `/search/fuzzy?q=${encodeURIComponent(query)}&limit=50`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await res.json();
  ```
- **Error Responses**:
  - `400`: Query parameter empty
  - `429`: Rate limit exceeded (>20 req/min)
  - `500`: Search failed

#### GET /search/suggestions
- **Mục đích**: Lấy gợi ý tìm kiếm (autocomplete) từ sender và subject
- **Auth**: Required (Bearer token)
- **Query Parameters**:
  - `prefix` (required): Prefix string để suggest (min 2 chars)
  - `limit` (optional): Số lượng suggestions (default: 5, max: 10)
- **Caching**: MongoDB TTL cache (1 hour expiration)
- **Response**:
  ```json
  {
    "status": 200,
    "data": {
      "suggestions": [
        {
          "value": "Looking Ahead to Motion in 2026",
          "type": "subject"
        },
        {
          "value": "iconscout@mail.iconscout.com",
          "type": "sender"
        }
      ],
      "prefix": "look",
      "cached": true
    }
  }
  ```
- **Suggestion Priority**:
  1. Subjects (prioritized for semantic search relevance)
  2. Senders (normalized to email addresses)
- **Data Processing**:
  - Extracts from 200 recent INBOX emails
  - Normalizes senders: "Name <email@domain.com>" → "email@domain.com"
  - Cleans subjects: Removes "Re:", "Fwd:" prefixes
  - Minimum subject length: 3 characters
- **Example**:
  ```js
  const res = await fetch(BACKEND + `/search/suggestions?prefix=${encodeURIComponent(prefix)}&limit=5`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  const data = await res.json();
  // Display suggestions in dropdown
  ```
- **Cache Behavior**:
  - First request: Fetch from Gmail API → Cache in MongoDB
  - Subsequent requests: Serve from cache (instant)
  - TTL: 1 hour (auto-cleanup via MongoDB index)

#### POST /search/semantic
- **Mục đích**: Tìm kiếm emails theo ý nghĩa (concept-based search) sử dụng AI embeddings
- **Auth**: Required (Bearer token)
- **Body**:
  ```json
  {
    "query": "meeting about project deadline",
    "limit": 20,
    "threshold": 0.5
  }
  ```
- **Query Processing**:
  1. Generate embedding cho query (768 dimensions)
  2. Compare với embeddings của emails trong database
  3. Calculate cosine similarity scores
  4. Filter results với threshold (default: 0.5)
  5. Sort by similarity score (highest first)
- **Response**:
  ```json
  {
    "status": 200,
    "data": {
      "query": "meeting about project deadline",
      "results": [
        {
          "emailId": "19aba6e5873a9087",
          "threadId": "19aba6e5873a9087",
          "subject": "Q4 Project Milestone Discussion",
          "from": "manager@company.com",
          "snippet": "Let's discuss the upcoming project milestones and deadlines...",
          "receivedDate": "2025-12-20T14:30:00.000Z",
          "similarityScore": 0.87,
          "matchedText": "From: manager@company.com\nSubject: Q4 Project Milestone Discussion\nLet's discuss..."
        }
      ],
      "totalResults": 5,
      "processingTimeMs": 1240
    }
  }
  ```
- **Auto-Indexing**: Nếu chưa có embeddings → tự động index 200 emails gần nhất
  ```json
  {
    "status": 200,
    "data": {
      "query": "meeting",
      "results": [],
      "totalResults": 0,
      "message": "Indexing emails in background. Please try again in a few seconds."
    }
  }
  ```
- **Semantic Features**:
  - Concept matching: "meeting" → finds "discussion", "call", "sync"
  - Language understanding: "urgent" → finds "ASAP", "critical", "important"
  - Context awareness: Considers sender, subject, and body together
  - Embedding text includes: `From: <sender>\nSubject: <subject>\n<body>`
- **Example**:
  ```js
  const res = await fetch(BACKEND + `/search/semantic`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: searchQuery,
      limit: 50,
      threshold: 0.5
    })
  });
  const data = await res.json();
  ```
- **Performance**:
  - Query embedding: 1 Gemini API call (~200ms)
  - Similarity calculation: Local computation (O(N) where N = indexed emails)
  - Gmail API calls: Only for matched emails (typically 5-20)
  - Total time: ~1-2 seconds for 200 indexed emails

#### POST /search/index
- **Mục đích**: Manually trigger email indexing cho semantic search
- **Auth**: Required (Bearer token)
- **Body**:
  ```json
  {
    "limit": 200
  }
  ```
- **Response**:
  ```json
  {
    "status": 200,
    "data": {
      "success": 185,
      "failed": 15,
      "failedEmails": [
        "email_id_1 (Network timeout)",
        "email_id_2 (Empty content)"
      ]
    }
  }
  ```
- **Indexing Process**:
  1. Fetch N recent emails from INBOX
  2. For each email: Generate embedding (768D vector)
  3. Store embedding + text in MongoDB
  4. Retry failed emails (max 2 retries)
- **Auto-Indexing on First Login**: Triggered automatically for new users
- **Example**:
  ```js
  const res = await fetch(BACKEND + `/search/index`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ limit: 200 })
  });
  ```

#### GET /search/index/stats
- **Mục đích**: Lấy thống kê indexing status
- **Auth**: Required (Bearer token)
- **Response**:
  ```json
  {
    "status": 200,
    "data": {
      "totalEmails": 250,
      "indexedEmails": 200,
      "pendingEmails": 50,
      "lastIndexedAt": "2025-12-24T18:30:00.000Z"
    }
  }
  ```
        "Invoice",
        "Important meeting"
      ]
    }
  }
  ```

### Kanban APIs (Dynamic Columns with Gmail Label Sync)

> **🎯 Kiến trúc:** Mỗi cột Kanban ánh xạ tới một Gmail Label. Moving emails = thay đổi labels trong Gmail. Inbox luôn hiện diện (không lưu DB), các cột khác là custom columns với Gmail label mapping.

---

#### GET /kanban/config
- **Mục đích**: Lấy cấu hình Kanban board của user (danh sách columns)
- **Auth**: Required (Bearer token)
- **Response 200**:
  ```json
  {
    "status": 200,
    "data": {
      "_id": "507f1f77bcf86cd799439011",
      "userId": "user-123",
      "columns": [
        {
          "id": "todo",
          "name": "To Do",
          "order": 0,
          "gmailLabel": "STARRED",
          "gmailLabelName": "Starred",
          "mappingType": "label",
          "color": "#FFA500",
          "isVisible": true,
          "emailCount": 15,
          "hasLabelError": false
        },
        {
          "id": "done_1735901234567",
          "name": "Done",
          "order": 1,
          "gmailLabel": "Label_123",
          "gmailLabelName": "Done",
          "mappingType": "label",
          "color": "#32CD32",
          "isVisible": true,
          "emailCount": 8,
          "hasLabelError": false
        }
      ],
      "showInbox": true,
      "defaultSort": "date",
      "lastModified": "2026-01-03T10:30:00.000Z"
    }
  }
  ```
- **Lưu ý**:
  - `gmailLabel`: Gmail API label ID (ví dụ: `STARRED`, `Label_123`)
  - `gmailLabelName`: Tên hiển thị thân thiện (lưu trong MongoDB)
  - `hasLabelError: true`: Gmail label đã bị xóa (cần recovery)
  - Cột Inbox KHÔNG được trả về trong config (được xử lý riêng ở frontend)

---

#### POST /kanban/columns
- **Mục đích**: Tạo cột Kanban mới với Gmail label mapping
- **Auth**: Required (Bearer token)
- **Body**:
  ```json
  {
    "name": "Urgent",
    "color": "#FF0000",
    "gmailLabel": "Urgent",
    "createNewLabel": true
  }
  ```
- **Parameters**:
  - `name` (string, bắt buộc): Tên cột hiển thị (tối đa 100 ký tự)
  - `color` (string, tùy chọn): Mã hex màu, mặc định: `#64748b`
  - `gmailLabel` (string, bắt buộc): Gmail label để ánh xạ
  - `createNewLabel` (boolean, bắt buộc): 
    - `true`: Tạo Gmail label mới
    - `false`: Ánh xạ tới label hiện có
- **Response 201**:
  ```json
  {
    "status": 201,
    "message": "Column created successfully",
    "data": {
      "id": "urgent_1735901234567",
      "name": "Urgent",
      "order": 2,
      "gmailLabel": "Label_456",
      "gmailLabelName": "Urgent",
      "newLabelId": "Label_456",
      "mappingType": "label",
      "color": "#FF0000",
      "isVisible": true,
      "emailCount": 0
    }
  }
  ```
- **Response 400 - Validation Errors**:
  ```json
  {
    "status": 400,
    "message": "Cannot create new label with reserved Gmail label name \"inbox\". Reserved labels: inbox, sent, drafts, spam, trash, starred, important, unread, chat, scheduled, snoozed. Tip: Use \"Map to existing label\" option to map with system labels like IMPORTANT, STARRED, etc."
  }
  ```
  ```json
  {
    "status": 400,
    "message": "Gmail label \"STARRED\" is already mapped to column \"To Do\""
  }
  ```
- **Lưu ý**:
  - **Reserved Labels**: KHÔNG thể TẠO label mới tên `inbox`, `sent`, `drafts`, `spam`, `trash`, `starred`, `important`, `unread`, `chat`, `scheduled`, `snoozed`
  - **System Label Mapping**: CÓ THỂ ánh xạ tới system labels hiện có (ví dụ: `STARRED`, `IMPORTANT`) bằng cách set `createNewLabel: false`
  - **Duplicate Prevention**: Backend validate không có hai cột ánh xạ cùng một Gmail label
- **Example**:
  ```js
  const res = await fetch(BACKEND + '/kanban/columns', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'High Priority',
      color: '#FF4500',
      gmailLabel: 'IMPORTANT',
      createNewLabel: false // Map to existing system label
    })
  });
  ```

---

#### PUT /kanban/columns/:columnId
- **Mục đích**: Cập nhật thuộc tính cột (tên, màu, hiển thị)
- **Auth**: Required (Bearer token)
- **Params**: `:columnId` - ID cột
- **Body**:
  ```json
  {
    "name": "High Priority",
    "color": "#FF4500",
    "isVisible": true
  }
  ```
- **Response 200**:
  ```json
  {
    "status": 200,
    "message": "Column updated successfully",
    "data": {
      "id": "urgent_1735901234567",
      "name": "High Priority",
      "color": "#FF4500",
      "isVisible": true
    }
  }
  ```
- **Lưu ý**:
  - Không thể cập nhật `gmailLabel` trực tiếp (dùng endpoint `remap-label` thay thế)
  - Frontend sử dụng optimistic update với rollback khi lỗi

---

#### POST /kanban/columns/reorder
- **Mục đích**: Sắp xếp lại thứ tự các cột (thay đổi thứ tự hiển thị)
- **Auth**: Required (Bearer token)
- **Body**:
  ```json
  {
    "columnOrder": [
      "urgent_1735901234567",
      "todo",
      "done_1735901234567"
    ]
  }
  ```
- **Response 200**:
  ```json
  {
    "status": 200,
    "message": "Columns reordered successfully",
    "data": {
      "columns": [
        {
          "id": "urgent_1735901234567",
          "name": "Urgent",
          "order": 0
        },
        {
          "id": "todo",
          "name": "To Do",
          "order": 1
        },
        {
          "id": "done_1735901234567",
          "name": "Done",
          "order": 2
        }
      ]
    }
  }
  ```
- **Lưu ý**:
  - Frontend sử dụng optimistic update và hiển thị success toast
  - Rollback và error toast nếu API call thất bại

---

#### POST /kanban/columns/:columnId/remap-label
- **Mục đích**: Ánh xạ lại cột tới Gmail label khác (dùng cho recovery sau khi label bị xóa)
- **Auth**: Required (Bearer token)
- **Params**: `:columnId` - ID cột cần remap
- **Body**:
  ```json
  {
    "gmailLabel": "Label_789",
    "gmailLabelName": "Urgent Tasks",
    "createNewLabel": false
  }
  ```
- **Response 200**:
  ```json
  {
    "status": 200,
    "message": "Column remapped to label \"Urgent Tasks\" successfully",
    "data": {
      "id": "urgent_1735901234567",
      "name": "Urgent",
      "gmailLabel": "Label_789",
      "gmailLabelName": "Urgent Tasks",
      "hasLabelError": false,
      "labelErrorMessage": null
    }
  }
  ```
- **Use Cases**:
  - **Gmail label bị xóa**: User có thể remap cột tới label mới/hiện có
  - **Thay đổi label mapping**: Chuyển cột sang label khác mà không cần tạo lại cột
- **Lưu ý**:
  - Xóa flag `hasLabelError` khi remap thành công
  - Sử dụng bởi component `RecoverLabelModal` với optimistic update

---

#### POST /kanban/columns/:columnId/delete
- **Mục đích**: Xóa cột Kanban (tùy chọn xóa Gmail label)
- **Auth**: Required (Bearer token)
- **Params**: `:columnId` - ID cột cần xóa
- **Body**:
  ```json
  {
    "deleteGmailLabel": false
  }
  ```
- **Response 200**:
  ```json
  {
    "status": 200,
    "message": "Column deleted successfully",
    "data": {
      "deletedColumnId": "urgent_1735901234567",
      "gmailLabelDeleted": false
    }
  }
  ```
- **Lưu ý**:
  - **Optimistic deletion**: Frontend xóa cột ngay lập tức, rollback khi lỗi
  - Không thể xóa system columns (`isSystem: true`)
  - Nếu `deleteGmailLabel: true`, cũng xóa Gmail label (cẩn thận!)

---

#### POST /kanban/columns/:columnId/clear-error
- **Mục đích**: Xóa flag lỗi label (sau khi user tự tạo lại Gmail label)
- **Auth**: Required (Bearer token)
- **Params**: `:columnId` - ID cột
- **Response 200**:
  ```json
  {
    "status": 200,
    "message": "Label error cleared",
    "data": {
      "id": "urgent_1735901234567",
      "hasLabelError": false,
      "labelErrorMessage": null
    }
  }
  ```

---

#### GET /kanban/columns/:columnId/emails
- **Mục đích**: Lấy danh sách emails cho một cột Kanban cụ thể
- **Auth**: Required (Bearer token)
- **Params**: `:columnId` - ID cột
- **Query**: 
  - `limit` (tùy chọn): Số email tối đa trả về (mặc định: 50)
- **Response 200**:
  ```json
  {
    "status": 200,
    "data": {
      "messages": [
        {
          "id": "msg_123abc",
          "threadId": "thread_456def",
          "subject": "Project Update",
          "from": "Alice <alice@example.com>",
          "to": "me@gmail.com",
          "snippet": "Here's the latest update on the project...",
          "summary": "Alice provides a project status update with three key milestones.",
          "date": "2026-01-03T09:15:00.000Z",
          "isUnread": true,
          "hasAttachment": false,
          "labelIds": ["STARRED", "INBOX"],
          "htmlBody": "<div>...</div>",
          "textBody": "Here's the latest update..."
        }
      ],
      "total": 15
    }
  }
  ```
- **Response 404 - Label Error**:
  ```json
  {
    "status": 404,
    "message": "Gmail label not found. It may have been deleted.",
    "data": {
      "hasLabelError": true,
      "labelErrorMessage": "Gmail label not found",
      "labelErrorDetectedAt": "2026-01-03T10:00:00.000Z"
    }
  }
  ```
- **Lưu ý**:
  - Trả về emails có `gmailLabel` của cột từ Gmail API
  - Bao gồm AI summary nếu đã được tạo trước đó
  - `hasLabelError: true` kích hoạt recovery UI ở frontend
- **Example**:
  ```js
  const res = await fetch(BACKEND + `/kanban/columns/todo/emails?limit=50`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await res.json();
  console.log('Emails in To Do:', data.data.messages);
  ```

---

#### GET /mail/inbox
- **Mục đích**: Lấy emails từ Gmail INBOX label (endpoint đặc biệt cho cột inbox)
- **Auth**: Required (Bearer token)
- **Query**: 
  - `limit` (tùy chọn): Số email tối đa (mặc định: 50)
- **Response 200**:
  ```json
  {
    "status": 200,
    "messages": [
      {
        "id": "msg_789xyz",
        "threadId": "thread_012abc",
        "subject": "Meeting Tomorrow",
        "from": "Bob <bob@example.com>",
        "snippet": "Don't forget our meeting tomorrow at 2pm",
        "date": "2026-01-03T08:00:00.000Z",
        "isUnread": true,
        "hasAttachment": false,
        "labelIds": ["INBOX"],
        "htmlBody": "<div>...</div>"
      }
    ]
  }
  ```
- **Lưu ý**:
  - Frontend áp dụng **client-side deduplication** (xóa emails đã có trong cột khác)
  - Được fetch **SAU CÙNG** sau tất cả cột khác để đảm bảo filtering chính xác
- **Example**:
  ```js
  // Frontend fetching strategy
  // 1. Fetch non-inbox columns first
  await Promise.all(
    nonInboxColumns.map(col => fetchColumnEmails(col.id))
  );
  
  // 2. Fetch inbox LAST for accurate deduplication
  const inboxRes = await fetch(BACKEND + '/mail/inbox?limit=50', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  // 3. Filter out emails already in other columns
  const inboxEmails = inboxRes.messages.filter(email =>
    !otherColumnEmailIds.has(email.id)
  );
  ```

---

#### POST /kanban/move
- **Mục đích**: Di chuyển email giữa các cột Kanban (thay đổi Gmail labels)
- **Auth**: Required (Bearer token)
- **Body**:
  ```json
  {
    "emailId": "msg_123abc",
    "threadId": "thread_456def",
    "fromColumnId": "inbox",
    "toColumnId": "todo",
    "destinationIndex": 0
  }
  ```
- **Parameters**:
  - `emailId` (string, bắt buộc): Gmail message ID
  - `threadId` (string, bắt buộc): Gmail thread ID
  - `fromColumnId` (string, bắt buộc): ID cột nguồn
  - `toColumnId` (string, bắt buộc): ID cột đích
  - `destinationIndex` (number, tùy chọn): Vị trí trong cột đích (chỉ UI, không persist)
- **Response 200**:
  ```json
  {
    "status": 200,
    "message": "Email moved successfully",
    "data": {
      "emailId": "msg_123abc",
      "fromColumnId": "inbox",
      "toColumnId": "todo",
      "addedLabels": ["STARRED"],
      "removedLabels": ["INBOX"],
      "newMetadata": {
        "cachedColumnId": "todo",
        "labelIds": ["STARRED", "IMPORTANT"],
        "kanbanUpdatedAt": "2026-01-03T10:30:00.000Z"
      }
    }
  }
  ```
- **Special Cases**:
  1. **Từ Inbox → Cột khác**:
     - Xóa label `INBOX` (archives email trong Gmail)
     - Thêm label của cột đích
  2. **Từ Cột khác → Inbox**:
     - Thêm label `INBOX` (un-archives email)
     - Xóa label của cột nguồn
  3. **Auto-Summary Generation**:
     - Nếu di chuyển TỪ inbox VÀ email chưa có summary
     - Backend tự động queue AI summarization task
- **Lưu ý**:
  - **Optimistic UI**: Frontend di chuyển email ngay lập tức, revert khi lỗi
  - **EventEmitter**: Backend emit event `email.moved` để xử lý async
  - **MongoDB Cache**: Cập nhật `EmailMetadata.cachedColumnId` và `labelIds`
- **Example**:
  ```js
  // Optimistic move with rollback
  const backup = [...columns];
  setColumns(optimisticUpdate);
  
  try {
    await fetch(BACKEND + '/kanban/move', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        emailId: email.id,
        threadId: email.threadId,
        fromColumnId: 'inbox',
        toColumnId: 'todo'
      })
    });
    showToast('Moved to To Do', 'success');
  } catch (error) {
    setColumns(backup); // Rollback
    showToast('Failed to move email', 'error');
  }
  ```

---

#### GET /kanban/validate-labels
- **Mục đích**: Validate tất cả Gmail labels của các cột vẫn tồn tại (check label bị xóa)
- **Auth**: Required (Bearer token)
- **Response 200**:
  ```json
  {
    "status": 200,
    "data": {
      "isValid": false,
      "duplicates": [
        {
          "label": "STARRED",
          "columns": ["todo", "urgent_1735901234567"]
        }
      ],
      "missing": [
        {
          "columnId": "done_1735901234567",
          "columnName": "Done",
          "gmailLabel": "Label_123"
        }
      ]
    }
  }
  ```
- **Lưu ý**:
  - Dùng cho health checks và diagnostics
  - Missing labels kích hoạt recovery UI

---

#### POST /kanban/fix-duplicate-labels
- **Mục đích**: Tự động fix các label mapping bị duplicate (admin/repair endpoint)
- **Auth**: Required (Bearer token)
- **Response 200**:
  ```json
  {
    "status": 200,
    "message": "Fixed 1 duplicate label mapping(s)",
    "data": {
      "fixed": [
        {
          "columnId": "urgent_1735901234567",
          "oldLabel": "STARRED",
          "newLabel": "Label_999",
          "newLabelName": "Urgent (fixed)"
        }
      ]
    }
  }
  ```

### Background Service (Cron Job)

#### Automatic Snooze Expiration
- **Mục đích**: Tự động restore emails khi hết thời gian snooze
- **Schedule**: Chạy mỗi 5 giây (`'*/5 * * * * *'`)
- **Logic**:
  ```typescript
  @Cron('*/5 * * * * *')
  async processExpiredSnoozes() {
    const expiredSnoozes = await this.findExpiredSnoozes();
    for (const snooze of expiredSnoozes) {
      await this.restoreEmail(snooze);
      await this.deleteSnoozeRecord(snooze.emailId);
    }
  }
  ```
- **Không cần gọi từ frontend** - chạy tự động trên server

---
## 5) Ví dụ mã frontend (login → refresh → danh sách mail)
```js
const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// 1) Bắt đầu OAuth: (mở popup hoặc redirect)
function startGoogleLogin() {
  window.location.href = BACKEND + '/auth/google';
}

// 2) Khi FE nhận redirect với ?auth=success -> lấy access token bằng cookie refresh
async function obtainAccessTokenFromCookie() {
  const r = await fetch(BACKEND + '/auth/refresh', { method: 'POST', credentials: 'include' });
  if (!r.ok) throw new Error('No session');
  const j = await r.json();
  return j.accessToken;
}

// 3) Gọi API mail
async function getMailboxes(accessToken) {
  const r = await fetch(BACKEND + '/mailboxes', {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  return await r.json();
}

// Usage example in App start
// if window.location.search has auth=success -> call obtainAccessTokenFromCookie()
```

Lưu ý: luôn dùng `credentials: 'include'` khi bạn muốn cookie HttpOnly được gửi cùng request.

---
## 5) Lưu trữ token & hành vi khi đóng/mở app
- **App refresh token**: lưu server-side (sessions collection) và trong cookie HttpOnly (`refreshToken`). Cookie tồn tại qua việc đóng/mở trình duyệt nếu `maxAge` chưa hết.
- **App access token**: ngắn hạn (~15m), trả cho frontend trên `/auth/refresh`. KHÔNG nên lưu access token dài hạn trong `localStorage` (kém an toàn). Tốt nhất lưu trong memory (React state) và refresh khi page reload hoặc access token hết hạn.
- **Google refresh token**: lưu trên record `users.googleRefreshToken` (hiện lưu plain text) — backend dùng để gọi Gmail API server-side.

---
## 6) Lỗi thường gặp & cách xử lý
1) `redirect_uri_mismatch` (Error 400)
- Nguyên nhân: `redirect_uri` trong request OAuth không khớp với Authorized redirect URI đã đăng ký trong Google Cloud Console.
- Khắc phục: kiểm tra `GOOGLE_CALLBACK_URL` backend sử dụng và add chính xác URI đó (ví dụ `http://localhost:5000/auth/google/callback`) vào Google Console → APIs & Services → Credentials → OAuth client → Authorized redirect URIs.

2) `access_denied` (Error 403) / "Access blocked: app has not completed verification"
- Nguyên nhân: app đang ở trạng thái Testing hoặc chưa được verify; account bạn đang chọn không phải Test user.
- Khắc phục: trong Google Cloud Console → OAuth consent screen: thêm email account bạn dùng vào Test users, hoặc submit app để verify (nếu muốn public).

3) `No Google refresh token for user` (backend error)
- Nguyên nhân: backend không có `googleRefreshToken` cho user (user chưa consent hoặc refresh_token chưa được lưu).
- Khắc phục: làm lại OAuth flow cho user (mở `/auth/google` và ensure Google returns refresh_token; thường khi first consent với `access_type=offline` và `prompt=consent` sẽ nhận refresh token).

4) 401 from JwtAuthGuard
- Nguyên nhân: không có header `Authorization: Bearer <accessToken>` hoặc token expired/invalid.
- Khắc phục: gọi `/auth/refresh` (cookie-based) để lấy accessToken, hoặc re-login.

---
## 7) Troubleshooting / Debug tips
- Kiểm tra cookie trong DevTools → Application → Cookies → domain backend → có `refreshToken` không, expiry là khi nào.
- Kiểm tra DB users: có `googleRefreshToken` cho người dùng không.
- Kiểm tra CORS: backend phải allow `origin` (FE_URL) và `credentials: true`.
- Nếu Gmail API trả lỗi khi dùng stored refresh token: refresh token có thể bị revoked — yêu cầu user re-consent.

---
## 8) Gợi ý bảo mật (tương lai)
- Mã hóa `googleRefreshToken` trước khi lưu (AES-GCM) hoặc dùng KMS/Secret Manager.
- Xem xét dùng RS256 cho app access token nếu bạn có nhiều services validate token.
- Thêm endpoint để user quản lý các sessions (liệt kê & revoke), hỗ trợ multi-device.

---
## 9) Liên hệ
Nếu bạn muốn, tôi có thể:
- Tạo `docapi.md` này vào repo (đã tạo) và sửa thêm theo yêu cầu UI/format.
- Thêm endpoint debug (temporary) để hiển thị `hasGoogleRefreshToken` cho user.
- Chuyển frontend để không dùng `localStorage` cho access token (mình có thể cập nhật `frontend/src/App.jsx`).


*File: `docapi.md` (auto-generated).*

---

# 📊 WEEK 2 APIs - Kanban Board, AI Summary & Snooze

> **⚠️ CHÚ Ý:** Các APIs dưới đây là phần mở rộng cho TUẦN 2, sử dụng **Database-based approach** (lưu status vào MongoDB).

---

## 📋 Mục lục Week 2 APIs

1. [Kanban Board APIs](#kanban-board-apis)
2. [AI Summarization APIs](#ai-summarization-apis)
3. [Snooze Feature APIs](#snooze-feature-apis)
4. [Background Services](#background-services)
5. [Database Schema](#database-schema)

---

## 1️⃣ Kanban Board APIs

> **🎯 Kiến trúc:** Database **CHỈ** lưu emails mà user đã kéo vào Kanban (TODO/IN_PROGRESS/DONE). INBOX là Gmail inbox thực, không lưu DB.

---

### 📋 GET `/mail/inbox`

**Mô tả:** Lấy danh sách emails từ Gmail inbox (không qua database)

**Authentication:** Required (JWT)

**Query Parameters:**
- `limit` (optional): Số lượng emails tối đa (default: 50)

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "messages": [
      {
        "id": "msg_abc123",
        "threadId": "thread_xyz",
        "subject": "Weekly meeting notes",
        "from": "boss@company.com",
        "to": "you@company.com",
        "date": "Mon, 9 Dec 2024 14:30:00 +0700",
        "snippet": "Here are the notes from today's meeting...",
        "labelIds": ["INBOX", "UNREAD"],
        "textBody": "Full email content...",
        "htmlBody": "<html>...</html>"
      }
    ],
    "total": 42
  }
}
```

**Ví dụ Frontend:**
```javascript
// Load Gmail inbox (source column)
const loadInbox = async () => {
  const response = await fetch(
    'http://localhost:5000/mail/inbox?limit=50',
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      credentials: 'include'
    }
  );
  
  const data = await response.json();
  return data.data.messages; // Pure Gmail data
};
```

**Ví dụ cURL:**
```bash
curl http://localhost:5000/mail/inbox?limit=50 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 📋 GET `/kanban/columns/:status/emails`

**Mô tả:** Lấy emails theo status từ **database** (chỉ emails đã được user kéo vào Kanban)

**Authentication:** Required (JWT)

**Path Parameters:**
- `status`: Enum [`TODO`, `IN_PROGRESS`, `DONE`] ⚠️ **KHÔNG có INBOX**

**Query Parameters:**
- `limit` (optional): Số lượng emails tối đa (default: 50)

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "messages": [
      {
        "id": "msg_abc123",
        "threadId": "thread_xyz",
        "subject": "Weekly meeting notes",
        "from": "boss@company.com",
        "to": "you@company.com",
        "date": "Mon, 9 Dec 2024 14:30:00 +0700",
        "snippet": "Here are the notes from today's meeting...",
        "labelIds": ["INBOX"],
        "textBody": "Full email content...",
        "htmlBody": "<html>...</html>",
        
        // Từ MongoDB (chỉ có khi email trong Kanban)
        "status": "TODO",
        "statusUpdatedAt": "2024-12-09T07:30:00.000Z",
        "summary": "[Urgency: Medium]\nSummary: Meeting notes..."
      }
    ],
    "total": 8
  }
}
```

**Ví dụ Frontend:**
```javascript
// Load Kanban board (chỉ emails trong DB)
const loadKanbanBoard = async () => {
  const [todoEmails, inProgressEmails, doneEmails] = await Promise.all([
    fetch('/kanban/columns/TODO/emails').then(r => r.json()),
    fetch('/kanban/columns/IN_PROGRESS/emails').then(r => r.json()),
    fetch('/kanban/columns/DONE/emails').then(r => r.json())
  ]);
  
  return {
    todoEmails: todoEmails.data.messages,
    inProgressEmails: inProgressEmails.data.messages,
    doneEmails: doneEmails.data.messages
  };
};

// Complete board với INBOX
const loadCompleteBoard = async () => {
  const [inbox, kanban] = await Promise.all([
    loadInbox(),           // Gmail API
    loadKanbanBoard()      // Database
  ]);
  
  return {
    inbox,                 // Emails chưa được organize
    ...kanban             // Emails đã trong Kanban
  };
};
```

**Ví dụ cURL:**
```bash
# Get TODO emails (from database)
curl http://localhost:5000/kanban/columns/TODO/emails \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Get DONE emails (from database)
curl http://localhost:5000/kanban/columns/DONE/emails \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 🔄 POST `/emails/:id/move`

**Mô tả:** Di chuyển email giữa các columns

**⚠️ Quan trọng:**
- **INBOX → TODO/IN_PROGRESS/DONE**: Tạo record mới trong database
- **TODO ↔ IN_PROGRESS ↔ DONE**: Update status trong database
- **TODO/IN_PROGRESS/DONE → INBOX**: Xóa record khỏi database (về Gmail inbox)

**Authentication:** Required (JWT)

**Path Parameters:**
- `id`: Email ID (Gmail message ID)

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "threadId": "thread_xyz",
  "toStatus": "TODO"
}
```

**Fields:**
- `threadId` (required): Gmail thread ID
- `toStatus` (required): New status - `TODO` | `IN_PROGRESS` | `DONE` | `INBOX`

**Response:**
```json
{
  "status": 200,
  "message": "Email moved to TODO",
  "data": {
    "emailId": "msg_abc123",
    "newStatus": "TODO",
    "created": true
  }
}
```

**Response Fields:**
- `created`: `true` nếu tạo record mới (INBOX → Kanban), `false` nếu update

**Ví dụ Frontend:**
```javascript
// Drag & Drop handler
const handleDragEnd = async (result) => {
  const { draggableId: emailId, source, destination } = result;
  
  if (!destination) return;
  
  const fromColumn = source.droppableId; // 'INBOX'
  const toColumn = destination.droppableId; // 'TODO'
  
  // Optimistic UI update
  moveEmailInUI(emailId, fromColumn, toColumn);
  
  try {
    const response = await fetch(`http://localhost:5000/emails/${emailId}/move`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        threadId: emailData.threadId,
        toStatus: toColumn
      })
    });
    
    const data = await response.json();
    
    if (data.data.created) {
      console.log('Email added to Kanban');
    } else {
      console.log('Email status updated');
    }
    
  } catch (error) {
    // Rollback UI
    moveEmailInUI(emailId, toColumn, fromColumn);
    alert('Failed to move email');
  }
};

// Case 1: INBOX → TODO (tạo record mới)
await fetch('/emails/msg_123/move', {
  method: 'POST',
  body: JSON.stringify({
    threadId: 'thread_xyz',
    toStatus: 'TODO'
  })
});
// → Database: INSERT new record với status=TODO

// Case 2: TODO → DONE (update existing)
await fetch('/emails/msg_123/move', {
  method: 'POST',
  body: JSON.stringify({
    threadId: 'thread_xyz',
    toStatus: 'DONE'
  })
});
// → Database: UPDATE status=DONE

// Case 3: TODO → INBOX (xóa khỏi Kanban)
await fetch('/emails/msg_123/move', {
  method: 'POST',
  body: JSON.stringify({
    threadId: 'thread_xyz',
    toStatus: 'INBOX'
  })
});
// → Database: DELETE record
// → Email về lại Gmail inbox
```

**Ví dụ cURL:**
```bash
# Move from INBOX to TODO (create record)
curl -X POST http://localhost:5000/emails/msg_abc123/move \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "thread_xyz",
    "toStatus": "TODO"
  }'

# Move from TODO to DONE (update record)
curl -X POST http://localhost:5000/emails/msg_abc123/move \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "thread_xyz",
    "toStatus": "DONE"
  }'

# Move back to INBOX (delete record)
curl -X POST http://localhost:5000/emails/msg_abc123/move \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "thread_xyz",
    "toStatus": "INBOX"
  }'
```

---

## 2️⃣ AI Summarization APIs

### 📝 POST `/emails/:id/summarize`

**Mô tả:** Tạo tóm tắt email bằng Gemini AI (cache trong MongoDB)

**Authentication:** Required (JWT)

**Path Parameters:**
- `id`: Email ID (Gmail message ID)

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "summary": "[Urgency: High]\nSummary: Client requesting urgent meeting to discuss Q4 budget concerns. Three cost reduction options proposed.\nAction: Review proposals and respond with meeting times by EOD Friday.",
    "cached": false
  }
}
```

**Fields:**
- `summary`: AI-generated summary text
- `cached`: `true` nếu lấy từ cache, `false` nếu vừa generate

**Summary Format:**
```
[Urgency: High/Medium/Low]
Summary: [Concise summary in 2-3 sentences]
Action: [Required action or "No action needed"]
```

**Ví dụ Frontend:**
```javascript
const getEmailSummary = async (emailId) => {
  // Show loading
  setLoading(true);
  
  try {
    const response = await fetch(
      `http://localhost:5000/emails/${emailId}/summarize`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        credentials: 'include'
      }
    );
    
    const data = await response.json();
    
    // Display summary
    console.log('Summary:', data.data.summary);
    console.log('From cache:', data.data.cached);
    
    return data.data.summary;
    
  } catch (error) {
    console.error('Failed to get summary:', error);
    return 'Failed to generate summary';
  } finally {
    setLoading(false);
  }
};

// Batch summarize for multiple emails
const summarizeAllInColumn = async (emailIds) => {
  const summaries = {};
  
  for (const emailId of emailIds) {
    try {
      const summary = await getEmailSummary(emailId);
      summaries[emailId] = summary;
      
      // Rate limiting: wait 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to summarize ${emailId}`);
    }
  }
  
  return summaries;
};
```

**Ví dụ cURL:**
```bash
curl -X POST http://localhost:5000/emails/msg_abc123/summarize \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**⚠️ Notes:**
- Lần đầu gọi: call Gemini AI (~2-3 giây)
- Lần sau: lấy từ MongoDB cache (instant)
- Rate limit: 60 requests/minute (Gemini free tier)
- Cần `GEMINI_API_KEY` trong `.env`

---

## 3️⃣ Snooze Feature APIs

### 🔕 POST `/emails/:id/snooze`

**Mô tả:** Snooze email đến thời điểm cụ thể

**Authentication:** Required (JWT)

**Path Parameters:**
- `id`: Email ID (Gmail message ID)

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "threadId": "thread_xyz",
  "snoozedUntil": "2025-12-10T15:00:00.000Z"
}
```

**Fields:**
- `threadId` (required): Gmail thread ID
- `snoozedUntil` (required): ISO 8601 date string (thời điểm wake up)

**Response:**
```json
{
  "status": 200,
  "data": {
    "success": true,
    "message": "Email snoozed until 12/10/2025, 3:00:00 PM",
    "snoozedUntil": "2025-12-10T15:00:00.000Z"
  }
}
```

**Ví dụ Frontend:**
```javascript
// Snooze for 2 hours
const snoozeEmail = async (email) => {
  const snoozeTime = new Date();
  snoozeTime.setHours(snoozeTime.getHours() + 2);
  
  const response = await fetch(`http://localhost:5000/emails/${email.id}/snooze`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      threadId: email.threadId,
      snoozedUntil: snoozeTime.toISOString()
    })
  });
  
  const data = await response.json();
  
  if (data.status === 200) {
    // Remove email from current view
    removeEmailFromUI(email.id);
    showToast(`Email snoozed until ${new Date(data.data.snoozedUntil).toLocaleString()}`);
  }
};

// Snooze options
const snoozeOptions = [
  { label: '1 hour', hours: 1 },
  { label: '2 hours', hours: 2 },
  { label: 'Tomorrow 9AM', getDate: () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }},
  { label: 'Next week', days: 7 }
];
```

**Ví dụ cURL:**
```bash
# Snooze until specific time
curl -X POST http://localhost:5000/emails/msg_abc123/snooze \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "thread_xyz",
    "snoozedUntil": "2025-12-10T15:00:00.000Z"
  }'
```

---

### 🔔 POST `/emails/:id/unsnooze`

**Mô tả:** Unsnooze email thủ công (trước khi hết thời gian)

**Authentication:** Required (JWT)

**Path Parameters:**
- `id`: Email ID (Gmail message ID)

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "success": true,
    "message": "Email restored"
  }
}
```

**Ví dụ Frontend:**
```javascript
const unsnoozeEmail = async (emailId) => {
  const response = await fetch(`http://localhost:5000/emails/${emailId}/unsnooze`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    credentials: 'include'
  });
  
  if (response.ok) {
    showToast('Email restored to inbox');
    await loadKanbanBoard();
  }
};
```

---

### 📋 GET `/emails/snoozed`

**Mô tả:** Lấy danh sách tất cả emails đang được snooze

**Authentication:** Required (JWT)

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": 200,
  "data": [
    {
      "userId": "user_123",
      "emailId": "msg_abc",
      "threadId": "thread_xyz",
      "snoozedUntil": "2025-12-10T15:00:00.000Z",
      "originalLabels": ["INBOX", "Label_TODO"],
      "isSnoozed": true,
      "createdAt": "2025-12-09T13:00:00.000Z"
    }
  ]
}
```

**Ví dụ Frontend:**
```javascript
const loadSnoozedEmails = async () => {
  const response = await fetch('http://localhost:5000/emails/snoozed', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    credentials: 'include'
  });
  
  const data = await response.json();
  
  // Display snoozed emails with countdown
  data.data.forEach(email => {
    const timeLeft = new Date(email.snoozedUntil) - new Date();
    console.log(`Email ${email.emailId} wakes up in ${Math.round(timeLeft / 1000 / 60)} minutes`);
  });
  
  return data.data;
};
```

---

## 4️⃣ Background Services

### ⏰ Snooze Scheduler (Cron Job)

**Frequency:** Every 1 minute

**Function:**
```typescript
// Auto-runs in background
1. Query snoozed emails với snoozedUntil <= NOW
2. For each expired snooze:
   - Restore email về original location (TODO/IN_PROGRESS/DONE)
   - Remove SNOOZED label
   - Delete snooze record từ database
3. Email tự động xuất hiện lại trong Kanban column
```

**Frontend không cần gọi API** - tự động chạy!

**⚠️ Note:** Snooze chỉ áp dụng cho emails **đã trong Kanban** (có record trong DB)

---

## 5️⃣ Database Schema

### EmailMetadata Collection

> **⚠️ Quan trọng:** Collection này **CHỈ** chứa emails mà user đã kéo vào Kanban. INBOX emails KHÔNG có trong database.

```typescript
{
  // Identifiers
  userId: String,          // User owner
  emailId: String,         // Gmail message ID (unique với userId)
  threadId: String,        // Gmail thread ID
  
  // Kanban Status (Week 2)
  status: Enum [
    'TODO',
    'IN_PROGRESS',
    'DONE'
  ],
  // ⚠️ KHÔNG có 'INBOX' - emails trong inbox không lưu DB
  
  statusUpdatedAt: Date,   // Timestamp khi status thay đổi
  
  // Cached Gmail Data (để giảm API calls)
  subject: String,
  from: String,
  snippet: String,
  receivedDate: Date,
  
  // AI Summary
  summary: String,         // AI-generated summary
  summaryGeneratedAt: Date,
  summaryModel: String,    // e.g., "gemini-pro"
  
  // Snooze Data (optional)
  snoozedUntil: Date,     // Wake up time
  originalStatus: String,  // Status trước khi snooze (TODO/IN_PROGRESS/DONE)
  isSnoozed: Boolean,
  
  // Timestamps
  createdAt: Date,         // Khi email được kéo vào Kanban lần đầu
  updatedAt: Date
}
```

**Indexes:**
```typescript
// Fast queries
{ userId: 1, emailId: 1 } // Unique - prevent duplicate
{ userId: 1, status: 1 }  // Kanban column queries
{ isSnoozed: 1, snoozedUntil: 1 } // Snooze scheduler
```

**Lifecycle:**
```typescript
// Email trong Gmail inbox
→ Database: KHÔNG có record

// User kéo INBOX → TODO
→ Database: INSERT { emailId, status: 'TODO', createdAt: NOW }

// User kéo TODO → IN_PROGRESS
→ Database: UPDATE status = 'IN_PROGRESS'

// User kéo IN_PROGRESS → INBOX
→ Database: DELETE record
→ Email về lại Gmail inbox (không có trong Kanban)
```

---

## 6️⃣ Error Handling

### Common Errors:

**400 Bad Request:**
```json
{
  "status": 400,
  "message": "Snooze time must be in the future"
}
```

**401 Unauthorized:**
```json
{
  "status": 401,
  "message": "Unauthorized"
}
```
→ Call `/auth/refresh` để lấy access token mới

**500 Internal Server Error:**
```json
{
  "status": 500,
  "message": "Failed to move email"
}
```

**Gemini API Error:**
```json
{
  "status": 500,
  "message": "Gemini AI not initialized. Please set GEMINI_API_KEY in .env file"
}
```
→ Cần setup GEMINI_API_KEY

---

## 7️⃣ Frontend Integration Examples

### Complete Kanban Workflow:

```javascript
// 1. Load Complete Board (4 columns)
const loadBoard = async () => {
  // Column 1: INBOX (từ Gmail API)
  const inbox = await fetch('/mail/inbox?limit=50')
    .then(r => r.json());
  
  // Columns 2-4: TODO, IN_PROGRESS, DONE (từ Database)
  const [todo, inProgress, done] = await Promise.all([
    fetch('/kanban/columns/TODO/emails').then(r => r.json()),
    fetch('/kanban/columns/IN_PROGRESS/emails').then(r => r.json()),
    fetch('/kanban/columns/DONE/emails').then(r => r.json())
  ]);
  
  setState({
    inboxEmails: inbox.data.messages,       // Pure Gmail data
    todoEmails: todo.data.messages,         // Database + Gmail merged
    inProgressEmails: inProgress.data.messages,
    doneEmails: done.data.messages
  });
};

// 2. Drag & Drop Handler
const onDragEnd = async (result) => {
  const { draggableId: emailId, source, destination } = result;
  
  if (!destination) return;
  
  const fromColumn = source.droppableId;      // 'INBOX'
  const toColumn = destination.droppableId;   // 'TODO'
  
  // Optimistic UI
  moveEmailInUI(emailId, fromColumn, toColumn);
  
  try {
    const response = await fetch(`/emails/${emailId}/move`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        threadId: emails[emailId].threadId,
        toStatus: toColumn
      })
    });
    
    const data = await response.json();
    
    // Log behavior
    if (fromColumn === 'INBOX') {
      console.log('✅ Email added to Kanban database');
    } else if (toColumn === 'INBOX') {
      console.log('✅ Email removed from Kanban database');
    } else {
      console.log('✅ Email status updated in database');
    }
    
  } catch (error) {
    // Rollback UI
    moveEmailInUI(emailId, toColumn, fromColumn);
    alert('Failed to move email');
  }
};

// 3. Get AI Summary (chỉ cho emails trong Kanban)
const showEmailDetail = async (emailId, fromColumn) => {
  if (fromColumn === 'INBOX') {
    // INBOX emails không có summary (chưa trong DB)
    alert('Kéo email vào Kanban để tạo summary');
    return;
  }
  
  const summary = await fetch(`/emails/${emailId}/summarize`, {
    method: 'POST'
  }).then(r => r.json());
  
  displaySummary(summary.data.summary);
};

// 4. Snooze email (chỉ cho emails trong Kanban)
const snooze = async (emailId, hours, currentColumn) => {
  if (currentColumn === 'INBOX') {
    alert('Chỉ snooze được emails trong Kanban');
    return;
  }
  
  const snoozeTime = new Date();
  snoozeTime.setHours(snoozeTime.getHours() + hours);
  
  await fetch(`/emails/${emailId}/snooze`, {
    method: 'POST',
    body: JSON.stringify({
      threadId: email.threadId,
      snoozedUntil: snoozeTime.toISOString()
    })
  });
  
  await loadBoard();
};

// 5. Example: Complete Board Component
const KanbanBoard = () => {
  const [board, setBoard] = useState({
    inbox: [],        // Gmail API
    todo: [],         // Database
    inProgress: [],   // Database
    done: []          // Database
  });
  
  useEffect(() => {
    loadBoard();
  }, []);
  
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Column id="INBOX" title="📥 Inbox" emails={board.inbox} />
      <Column id="TODO" title="📋 To Do" emails={board.todo} />
      <Column id="IN_PROGRESS" title="🔄 In Progress" emails={board.inProgress} />
      <Column id="DONE" title="✅ Done" emails={board.done} />
    </DragDropContext>
  );
};
```

---

## 8️⃣ Environment Setup

### Required Environment Variables:

```env
# Existing (Week 1)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MONGODB_URI=...

# New (Week 2)
GEMINI_API_KEY=your_gemini_api_key_here
```

### Get Gemini API Key:

1. Visit: https://ai.google.dev/
2. Click "Get API Key"
3. Create project or select existing
4. Copy API key
5. Add to `.env`: `GEMINI_API_KEY=AIzaSy...`

---

## 9️⃣ Testing

### Test Complete Flow:

```bash
# 1. Load INBOX (Gmail API)
curl http://localhost:5000/mail/inbox?limit=10 \
  -H "Authorization: Bearer YOUR_JWT"
# → Returns pure Gmail inbox emails

# 2. Move email from INBOX to TODO (tạo record trong DB)
curl -X POST http://localhost:5000/emails/msg_123/move \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"threadId":"thread_xyz","toStatus":"TODO"}'
# → Database: INSERT new record

# 3. Get TODO emails (from database)
curl http://localhost:5000/kanban/columns/TODO/emails \
  -H "Authorization: Bearer YOUR_JWT"
# → Returns emails có status=TODO trong DB

# 4. Move TODO → DONE (update trong DB)
curl -X POST http://localhost:5000/emails/msg_123/move \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"threadId":"thread_xyz","toStatus":"DONE"}'
# → Database: UPDATE status=DONE

# 5. Summarize email (chỉ emails trong Kanban)
curl -X POST http://localhost:5000/emails/msg_123/summarize \
  -H "Authorization: Bearer YOUR_JWT"
# → Generate AI summary và save vào DB

# 6. Snooze email (chỉ emails trong Kanban)
curl -X POST http://localhost:5000/emails/msg_123/snooze \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"threadId":"thread_xyz","snoozedUntil":"2025-12-10T15:00:00Z"}'

# 7. Move DONE → INBOX (xóa khỏi DB)
curl -X POST http://localhost:5000/emails/msg_123/move \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"threadId":"thread_xyz","toStatus":"INBOX"}'
# → Database: DELETE record
# → Email về lại Gmail inbox
```

---

## 🎯 Summary Week 2 APIs

| Category | Endpoints | Description |
|----------|-----------|-------------|
| **Inbox** | 1 API | Load Gmail inbox (không qua DB) |
| **Kanban** | 2 APIs | Get columns + Move emails |
| **AI Summary** | 2 APIs | Single + Batch Gemini summarization |
| **Snooze** | 3 APIs | Snooze/unsnooze/list |
| **Background** | 1 Job | Auto-restore snoozed emails (cron) |

**Total:** 8 new endpoints + 1 background service

**Architecture:** 
- **INBOX**: Pure Gmail API (không lưu DB)
- **Kanban (TODO/DONE)**: MongoDB là source of truth
- **Trigger**: Chỉ tạo DB record khi user kéo email vào Kanban
- **AI**: Google Gemini 1.5 Flash với hybrid concurrency (3 batches × 5 parallel)
- **Snooze**: MongoDB + Gmail labels + node-cron (runs every 5s)

**Performance Optimizations:**
- Batch AI processing với rate limiting aware
- Optimistic UI updates với rollback
- Efficient Gmail API calls với caching
- Auto-cleanup expired snoozes

**Security:**
- All endpoints require Bearer token authentication
- Gmail OAuth scopes properly configured
- Input validation với DTO classes
- Error handling với graceful fallbacks

---

## 🔍 Week 4: Semantic Search & Auto-Suggestions

### Architecture Overview

**Semantic Search Pipeline:**
```
User Query → Gemini Embedding (768D) → Cosine Similarity → Filter (threshold 0.5) → Sort → Results
     ↓                                         ↑
  1 API call                          MongoDB Cached Embeddings
                                      (From: sender, Subject: subject, Body: text)
```

**Auto-Suggestions Pipeline:**
```
User Input (≥2 chars) → Check MongoDB Cache → Return Suggestions
                              ↓ (cache miss)
                        Fetch 200 INBOX emails → Extract senders/subjects → Cache (1h TTL)
```

### Key Features

#### 1. **Semantic Search (Meaning-based)**
- **Technology**: Gemini text-embedding-004 (768 dimensions)
- **Algorithm**: Cosine similarity matching
- **Threshold**: 0.5 (configurable)
- **Auto-Indexing**: Triggered on first login or first semantic search
- **Performance**: 
  - Indexing: 200 emails × 1 API call = ~60 seconds (one-time)
  - Search: 1 API call + local computation = ~1-2 seconds
- **Use Cases**:
  - Concept matching: "meeting" finds "discussion", "call", "sync"
  - Language understanding: "urgent" finds "ASAP", "critical"
  - Context-aware: Searches across sender, subject, and body

#### 2. **Auto-Suggestions (Autocomplete)**
- **Technology**: MongoDB TTL cache (1-hour expiration)
- **Data Source**: 200 recent INBOX emails
- **Suggestion Types**:
  - Subjects (prioritized for semantic relevance)
  - Senders (normalized to email addresses)
- **Processing**:
  - Cleans subjects: Removes "Re:", "Fwd:" prefixes
  - Normalizes senders: "Name <email@domain.com>" → "email@domain.com"
  - Minimum length: 3 characters for subjects
- **Performance**: 
  - Cache hit: <10ms (instant)
  - Cache miss: ~500ms (Gmail API fetch + cache store)

#### 3. **Integration Flow**

**Frontend → Backend → AI → Database:**
```javascript
// 1. User types "meet" → Show suggestions
const suggestions = await fetch('/search/suggestions?prefix=meet&limit=5');
// Returns: ["Meeting Notes 2025", "Team Meeting Schedule", ...]

// 2. User clicks suggestion → Switch to semantic mode
setSearchMode('semantic');
router.push(`/inbox?q=${encodeURIComponent(suggestion)}`);

// 3. Semantic search triggered
const results = await fetch('/search/semantic', {
  body: JSON.stringify({ query: suggestion, threshold: 0.5 })
});
// Returns emails ranked by similarity score (0.5-1.0)
```

### API Summary

| Endpoint | Method | Purpose | Performance |
|----------|--------|---------|-------------|
| `/search/suggestions` | GET | Autocomplete dropdown | <10ms (cached) |
| `/search/semantic` | POST | AI-powered search | ~1-2s |
| `/search/fuzzy` | GET | Typo-tolerant search | ~100-200ms |
| `/search/index` | POST | Manual indexing | ~60s (200 emails) |
| `/search/index/stats` | GET | Indexing progress | <50ms |

### Cost Analysis

**Gemini API Quota:**
- **Indexing** (one-time): 200 API calls per user
- **Search**: 1 API call per query
- **Total per user per day**: ~1 indexing + ~20 searches = ~220 API calls
- **Free tier**: 1500 requests/day (supports ~75 users/day)

### Auto-Indexing Behavior

**Trigger Points:**
1. **First Login**: Auto-index 200 emails in background
2. **First Semantic Search**: If no embeddings found → auto-index
3. **Manual Trigger**: User clicks "Index Emails" button

**User Flow:**
```
Login → Background indexing starts → Toast notification
     → Wait 30-60s → Semantic search enabled
     → Click suggestion → Force semantic mode → Results!
```

### Error Handling

**Indexing Errors:**
- Network timeout: Retry (max 2)
- Empty email: Skip
- Rate limit: Wait and retry
- Failed emails: Log and continue

**Search Errors:**
- No embeddings: Trigger auto-indexing + return message
- Query too long: Truncate to 8000 chars
- Gemini API error: Fallback to fuzzy search (optional)

---

*Last updated: December 24, 2025 - Week 4 Implementation Complete*
