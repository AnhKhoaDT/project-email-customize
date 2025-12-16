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
- Biến môi trường quan trọng (backend):
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_CALLBACK_URL` (ví dụ `http://localhost:5000/auth/google/callback`)
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
## 4) Ví dụ mã frontend (login → refresh → danh sách mail)
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
| **AI Summary** | 1 API | Gemini-powered summarization |
| **Snooze** | 3 APIs | Snooze/unsnooze/list |
| **Background** | 1 Job | Auto-restore snoozed emails |

**Total:** 7 new endpoints + 1 background service

**Architecture:** 
- **INBOX**: Pure Gmail API (không lưu DB)
- **Kanban (TODO/IN_PROGRESS/DONE)**: MongoDB là source of truth
- **Trigger**: Chỉ tạo DB record khi user kéo email vào Kanban

---

*Last updated: December 10, 2025 - Week 2 Implementation*

---
---

# 📊 WEEK 3 APIs - Fuzzy Search & Filtering/Sorting

> **⚠️ CHÚ Ý:** APIs dưới đây là phần mở rộng cho TUẦN 3, bổ sung tính năng tìm kiếm thông minh và lọc/sắp xếp email.

---

## 📋 Mục lục Week 3 APIs

1. [Fuzzy Search Engine](#1️⃣-fuzzy-search-engine)
2. [Search Suggestions](#2️⃣-search-suggestions)
3. [Filtering & Sorting](#3️⃣-filtering--sorting)

---

## 1️⃣ Fuzzy Search Engine

### 🔍 POST `/search/fuzzy`

**Mô tả:** Tìm kiếm email với khả năng chịu lỗi chính tả (typo tolerance) và khớp một phần (partial matching). Không yêu cầu khớp chính xác từng ký tự.

**⚠️ Quan trọng:**
- Tìm kiếm trên **subject**, **sender** (name và email), **snippet**
- Hỗ trợ lỗi chính tả: "marketing" → tìm được "marketting", "marketng"
- Khớp một phần: "Nguy" → tìm được "Nguyễn Văn A", "nguyen@example.com"
- Kết quả được xếp hạng theo độ liên quan (relevanceScore)

**Authentication:** Required (JWT)

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "query": "marketing",
  "limit": 20,
  "includeBody": false
}
```

**Fields:**
- `query` (required): Chuỗi tìm kiếm
- `limit` (optional, default=50): Số lượng kết quả tối đa
- `includeBody` (optional, default=false): Có tìm kiếm trong nội dung email hay không (chậm hơn)

**Response:**
```json
{
  "status": 200,
  "data": {
    "query": "marketing",
    "results": [
      {
        "id": "msg_123",
        "threadId": "thread_abc",
        "subject": "Q4 Marketing Strategy",
        "from": "John Doe <john@example.com>",
        "snippet": "Let's discuss our marketing plans...",
        "date": "2025-12-16T10:30:00Z",
        "isUnread": false,
        "hasAttachment": true,
        "relevanceScore": 0.95
      },
      {
        "id": "msg_124",
        "subject": "Marketting Budget Review",
        "from": "Jane Smith <jane@example.com>",
        "snippet": "The marketting team needs...",
        "relevanceScore": 0.82
      }
    ],
    "totalResults": 15
  }
}
```

**Ví dụ Frontend:**
```javascript
const searchEmails = async (query) => {
  const response = await fetch('http://localhost:5000/search/fuzzy', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      limit: 20,
      includeBody: false // Set true for deeper search
    })
  });
  
  const data = await response.json();
  
  // Sort by relevance (already sorted by backend)
  return data.data.results;
};

// Usage
const results = await searchEmails("invoice");
// Tìm được: "invoice", "invoise" (typo), "Invoice #123", "inv-2023"
```

**Ví dụ cURL:**
```bash
# Basic fuzzy search
curl -X POST http://localhost:5000/search/fuzzy \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Nguyen",
    "limit": 10
  }'

# Search with body content (slower but more accurate)
curl -X POST http://localhost:5000/search/fuzzy \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "contract",
    "limit": 20,
    "includeBody": true
  }'
```

**Scoring Algorithm:**
- **Subject match**: Weight 2.0 (quan trọng nhất)
- **Sender match**: Weight 1.5
- **Snippet match**: Weight 1.0
- **Body match**: Weight 0.8 (nếu includeBody=true)
- **Threshold**: Chỉ trả về emails có score > 0.2 (20% match)

---

## 2️⃣ Search Suggestions

### 💡 GET `/search/suggestions?q=<query>`

**Mô tả:** Gợi ý tự động khi user gõ (auto-suggestion). Trả về danh sách sender names và subject keywords phù hợp.

**Authentication:** Required (JWT)

**Query Parameters:**
- `q` (required): Chuỗi tìm kiếm (tối thiểu 2 ký tự)

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "suggestions": [
      "Nguyễn Văn A <nguyenvana@example.com>",
      "nguyen.corp@company.com",
      "Marketing Team <marketing@example.com>",
      "Project",
      "Meeting"
    ]
  }
}
```

**Ví dụ Frontend:**
```javascript
// Debounced search suggestion
const getSuggestions = async (query) => {
  if (query.length < 2) return [];
  
  const response = await fetch(
    `http://localhost:5000/search/suggestions?q=${encodeURIComponent(query)}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );
  
  const data = await response.json();
  return data.data.suggestions;
};

// Usage with debounce (React example)
const [suggestions, setSuggestions] = useState([]);

const handleSearchInput = debounce(async (value) => {
  const results = await getSuggestions(value);
  setSuggestions(results);
}, 300);

// Render dropdown
<input 
  onChange={(e) => handleSearchInput(e.target.value)}
/>
{suggestions.length > 0 && (
  <div className="suggestions-dropdown">
    {suggestions.map(s => (
      <div onClick={() => performSearch(s)}>{s}</div>
    ))}
  </div>
)}
```

**Ví dụ cURL:**
```bash
curl "http://localhost:5000/search/suggestions?q=Nguyen" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 3️⃣ Filtering & Sorting

### 📊 GET `/mailboxes/:id/emails/filtered`

**Mô tả:** Lấy danh sách emails với filtering và sorting. Hỗ trợ lọc theo unread, attachment, và sắp xếp theo date/sender.

**Authentication:** Required (JWT)

**Path Parameters:**
- `id`: Label ID (ví dụ: `INBOX`, `SENT`, `STARRED`)

**Query Parameters:**
- `sortBy` (optional): Cách sắp xếp
  - `date-desc`: Mới nhất trước (default)
  - `date-asc`: Cũ nhất trước
  - `sender`: Sắp xếp theo tên người gửi (A-Z)
- `filterUnread` (optional): `true` để chỉ hiển thị email chưa đọc
- `filterAttachment` (optional): `true` để chỉ hiển thị email có đính kèm
- `limit` (optional, default=50): Số lượng emails
- `pageToken` (optional): Token cho pagination

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
        "id": "msg_123",
        "subject": "Important Document",
        "from": "Alice <alice@example.com>",
        "date": "2025-12-17T08:00:00Z",
        "isUnread": true,
        "hasAttachment": true,
        "snippet": "Please review the attached..."
      }
    ],
    "nextPageToken": "xyz123",
    "resultSizeEstimate": 42
  }
}
```

**Ví dụ Frontend:**
```javascript
// Complete filtering & sorting component
const EmailList = () => {
  const [sortBy, setSortBy] = useState('date-desc');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showAttachmentOnly, setShowAttachmentOnly] = useState(false);
  
  const loadEmails = async () => {
    const params = new URLSearchParams({
      sortBy,
      limit: '50'
    });
    
    if (showUnreadOnly) params.append('filterUnread', 'true');
    if (showAttachmentOnly) params.append('filterAttachment', 'true');
    
    const response = await fetch(
      `http://localhost:5000/mailboxes/INBOX/emails/filtered?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    const data = await response.json();
    return data.data.messages;
  };
  
  // UI controls
  return (
    <div>
      {/* Sort controls */}
      <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
        <option value="date-desc">Newest First</option>
        <option value="date-asc">Oldest First</option>
        <option value="sender">By Sender</option>
      </select>
      
      {/* Filter controls */}
      <label>
        <input 
          type="checkbox" 
          checked={showUnreadOnly}
          onChange={(e) => setShowUnreadOnly(e.target.checked)}
        />
        Unread Only
      </label>
      
      <label>
        <input 
          type="checkbox" 
          checked={showAttachmentOnly}
          onChange={(e) => setShowAttachmentOnly(e.target.checked)}
        />
        Has Attachment
      </label>
      
      {/* Email list */}
      <EmailCards emails={emails} />
    </div>
  );
};
```

**Ví dụ cURL:**
```bash
# Get unread emails, sorted by newest first
curl "http://localhost:5000/mailboxes/INBOX/emails/filtered?sortBy=date-desc&filterUnread=true&limit=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Get emails with attachments only
curl "http://localhost:5000/mailboxes/INBOX/emails/filtered?filterAttachment=true" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Combination: Unread emails with attachments, oldest first
curl "http://localhost:5000/mailboxes/INBOX/emails/filtered?sortBy=date-asc&filterUnread=true&filterAttachment=true" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 🎯 Summary Week 3 APIs

| Feature | Endpoints | Description |
|---------|-----------|-------------|
| **Fuzzy Search** | 1 API | Typo-tolerant search với relevance ranking |
| **Auto-Suggest** | 1 API | Gợi ý sender names và keywords |
| **Filter & Sort** | 1 API | Lọc unread/attachment + sắp xếp |

**Total:** 3 new endpoints

**Use Cases:**
- **Fuzzy Search**: User gõ "mareting" vẫn tìm được emails về "marketing"
- **Suggestions**: Dropdown hiện gợi ý khi user gõ 2+ ký tự
- **Filter/Sort**: Tìm nhanh "unread emails có attachment", sắp xếp theo date

---

*Week 3 APIs documented: December 17, 2025*

---
---

# 🧠 WEEK 4 APIs - Semantic Search & Kanban Configuration

> **⚠️ CHÚ Ý:** APIs dưới đây là phần mở rộng cho TUẦN 4, triển khai tìm kiếm ngữ nghĩa bằng AI và tùy chỉnh Kanban board.

---

## 📋 Mục lục Week 4 APIs

1. [Semantic Search Engine](#1️⃣-semantic-search-engine)
2. [Embedding Management](#2️⃣-embedding-management)
3. [Kanban Configuration](#3️⃣-kanban-configuration)

---

## 1️⃣ Semantic Search Engine

### 🔍 POST `/search/semantic`

**Mô tả:** Tìm kiếm email dựa trên **ý nghĩa** (semantic meaning) thay vì từ khóa chính xác. Sử dụng vector embeddings từ Gemini AI để tìm emails liên quan về mặt khái niệm.

**⚠️ Quan trọng:**
- Tìm kiếm dựa trên **vector similarity** (cosine similarity)
- Query "money" → tìm được emails về "invoice", "payment", "salary", "price"
- Query "urgent meeting" → tìm được "emergency call", "ASAP discussion"
- **Cần generate embeddings trước** bằng `/search/index`

**Authentication:** Required (JWT)

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "query": "financial reports",
  "limit": 20,
  "threshold": 0.5
}
```

**Fields:**
- `query` (required): Chuỗi tìm kiếm (có thể là câu hoặc khái niệm)
- `limit` (optional, default=20): Số lượng kết quả tối đa
- `threshold` (optional, default=0.5): Ngưỡng similarity (0-1). Càng cao càng chính xác

**Response:**
```json
{
  "status": 200,
  "data": {
    "query": "financial reports",
    "results": [
      {
        "id": "msg_456",
        "subject": "Q4 Revenue Analysis",
        "from": "Finance Team <finance@example.com>",
        "snippet": "Attached is the quarterly financial...",
        "date": "2025-12-15T14:00:00Z",
        "similarityScore": 0.89,
        "matchedText": "Q4 Revenue Analysis Attached is the quarterly financial..."
      },
      {
        "id": "msg_457",
        "subject": "Budget Summary",
        "from": "CFO <cfo@example.com>",
        "snippet": "Here's the budget breakdown...",
        "similarityScore": 0.76
      }
    ],
    "totalResults": 12,
    "searchedEmails": 150
  }
}
```

**Ví dụ Frontend:**
```javascript
const semanticSearch = async (query) => {
  const response = await fetch('http://localhost:5000/search/semantic', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      limit: 20,
      threshold: 0.5 // Adjust for precision
    })
  });
  
  const data = await response.json();
  
  if (data.status === 200) {
    return data.data.results;
  }
  
  throw new Error(data.message);
};

// Example usage
const results = await semanticSearch("cost reduction");
// Tìm được: "budget cuts", "expense optimization", "saving money", "price decrease"

// Conceptual search
const urgentEmails = await semanticSearch("urgent important deadline");
// Tìm được: emails với "ASAP", "urgent", "time-sensitive", "deadline tomorrow"
```

**Ví dụ cURL:**
```bash
# Basic semantic search
curl -X POST http://localhost:5000/search/semantic \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "project status update",
    "limit": 15,
    "threshold": 0.5
  }'

# High precision search (threshold 0.7)
curl -X POST http://localhost:5000/search/semantic \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "legal contract agreement",
    "limit": 10,
    "threshold": 0.7
  }'
```

**Similarity Scores:**
- **0.9 - 1.0**: Rất liên quan (highly relevant)
- **0.7 - 0.9**: Liên quan (relevant)
- **0.5 - 0.7**: Có liên quan một phần (partially relevant)
- **< 0.5**: Ít liên quan (less relevant) - không trả về

---

## 2️⃣ Embedding Management

### 🔄 POST `/search/index`

**Mô tả:** Generate embeddings cho emails (background indexing). **Phải chạy endpoint này trước khi dùng semantic search**.

**Authentication:** Required (JWT)

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "limit": 100
}
```

**Fields:**
- `limit` (optional, default=100): Số lượng emails tối đa cần index

**Response:**
```json
{
  "status": 200,
  "message": "Successfully indexed 100 emails",
  "indexed": 100
}
```

**Ví dụ Frontend:**
```javascript
// Run indexing on first use
const indexEmails = async () => {
  const response = await fetch('http://localhost:5000/search/index', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      limit: 200 // Index last 200 emails
    })
  });
  
  const result = await response.json();
  console.log(result.message);
  
  return result;
};

// Recommended: Run on app initialization
useEffect(() => {
  // Check if indexing needed
  getIndexStats().then(stats => {
    if (stats.data.pendingIndexing > 0) {
      indexEmails();
    }
  });
}, []);
```

**⚠️ Notes:**
- Indexing mất ~2-3 giây per email (Gemini API)
- Chạy 1 lần sau khi login hoặc khi có emails mới
- Embeddings được cache trong MongoDB
- Rate limit: 60 requests/minute (Gemini free tier)

---

### 📊 GET `/search/index/stats`

**Mô tả:** Kiểm tra trạng thái indexing (bao nhiêu emails đã có embeddings).

**Authentication:** Required (JWT)

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "totalEmails": 250,
    "indexedEmails": 180,
    "pendingIndexing": 70,
    "indexingProgress": 72.0
  }
}
```

**Ví dụ Frontend:**
```javascript
const getIndexStats = async () => {
  const response = await fetch('http://localhost:5000/search/index/stats', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  const data = await response.json();
  return data;
};

// Display progress bar
const IndexProgress = () => {
  const [stats, setStats] = useState(null);
  
  useEffect(() => {
    getIndexStats().then(setStats);
  }, []);
  
  if (!stats) return null;
  
  return (
    <div>
      <p>Indexing Progress: {stats.data.indexingProgress.toFixed(1)}%</p>
      <p>{stats.data.indexedEmails} / {stats.data.totalEmails} emails indexed</p>
      {stats.data.pendingIndexing > 0 && (
        <button onClick={indexEmails}>Index Remaining</button>
      )}
    </div>
  );
};
```

**Ví dụ cURL:**
```bash
curl http://localhost:5000/search/index/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 3️⃣ Kanban Configuration

### 📋 GET `/kanban/config`

**Mô tả:** Lấy cấu hình Kanban board của user (danh sách columns, label mapping).

**Authentication:** Required (JWT)

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "userId": "user_123",
    "columns": [
      {
        "id": "todo",
        "name": "To Do",
        "order": 0,
        "gmailLabel": "STARRED",
        "color": "#FFA500",
        "isVisible": true
      },
      {
        "id": "in_progress",
        "name": "In Progress",
        "order": 1,
        "gmailLabel": "IMPORTANT",
        "color": "#4169E1",
        "isVisible": true
      },
      {
        "id": "done",
        "name": "Done",
        "order": 2,
        "gmailLabel": null,
        "color": "#32CD32",
        "isVisible": true
      }
    ],
    "showInbox": true,
    "defaultSort": "date",
    "lastModified": "2025-12-17T10:00:00Z"
  }
}
```

**Column Fields:**
- `id`: Unique column ID
- `name`: Display name
- `order`: Sort order (0, 1, 2, ...)
- `gmailLabel`: Gmail label ID for syncing (STARRED, IMPORTANT, custom label, or null)
- `color`: Hex color code for UI
- `isVisible`: Whether column is shown

**Ví dụ Frontend:**
```javascript
const loadKanbanConfig = async () => {
  const response = await fetch('http://localhost:5000/kanban/config', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  const data = await response.json();
  return data.data;
};

// Render dynamic Kanban board
const KanbanBoard = () => {
  const [config, setConfig] = useState(null);
  
  useEffect(() => {
    loadKanbanConfig().then(setConfig);
  }, []);
  
  if (!config) return <Loading />;
  
  return (
    <div className="kanban-board">
      {config.columns
        .filter(col => col.isVisible)
        .sort((a, b) => a.order - b.order)
        .map(column => (
          <KanbanColumn 
            key={column.id}
            column={column}
          />
        ))
      }
    </div>
  );
};
```

---

### ➕ POST `/kanban/columns`

**Mô tả:** Tạo column mới trong Kanban board.

**Authentication:** Required (JWT)

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Review",
  "gmailLabel": "Label_9876",
  "color": "#FF6347"
}
```

**Fields:**
- `name` (required): Tên column
- `gmailLabel` (optional): Gmail label ID để sync (có thể null)
- `color` (optional): Màu sắc (hex code)

**Response:**
```json
{
  "status": 201,
  "message": "Column created successfully",
  "data": {
    "id": "col_1702789012345",
    "name": "Review",
    "order": 3,
    "gmailLabel": "Label_9876",
    "color": "#FF6347",
    "isVisible": true
  }
}
```

**Ví dụ Frontend:**
```javascript
const createColumn = async (columnData) => {
  const response = await fetch('http://localhost:5000/kanban/columns', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(columnData)
  });
  
  const result = await response.json();
  return result.data;
};

// Usage
const newColumn = await createColumn({
  name: "Waiting for Reply",
  gmailLabel: null, // No Gmail sync
  color: "#9370DB"
});
```

**Ví dụ cURL:**
```bash
curl -X POST http://localhost:5000/kanban/columns \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Archive",
    "gmailLabel": null,
    "color": "#808080"
  }'
```

---

### ✏️ POST `/kanban/columns/:columnId`

**Mô tả:** Cập nhật column (rename, change label mapping, color, visibility).

**Authentication:** Required (JWT)

**Path Parameters:**
- `columnId`: Column ID cần update

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Needs Review",
  "gmailLabel": "IMPORTANT",
  "color": "#FF4500",
  "isVisible": true
}
```

**Response:**
```json
{
  "status": 200,
  "message": "Column updated successfully",
  "data": {
    "id": "col_123",
    "name": "Needs Review",
    "order": 2,
    "gmailLabel": "IMPORTANT",
    "color": "#FF4500",
    "isVisible": true
  }
}
```

**Ví dụ Frontend:**
```javascript
const updateColumn = async (columnId, updates) => {
  const response = await fetch(
    `http://localhost:5000/kanban/columns/${columnId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    }
  );
  
  return await response.json();
};

// Rename column
await updateColumn('col_123', { name: 'Done & Archived' });

// Change label mapping
await updateColumn('col_123', { gmailLabel: 'STARRED' });

// Hide column
await updateColumn('col_123', { isVisible: false });
```

---

### 🗑️ POST `/kanban/columns/:columnId/delete`

**Mô tả:** Xóa column khỏi Kanban board.

**Authentication:** Required (JWT)

**Path Parameters:**
- `columnId`: Column ID cần xóa

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": 200,
  "message": "Column deleted successfully"
}
```

**Ví dụ Frontend:**
```javascript
const deleteColumn = async (columnId) => {
  if (!confirm('Delete this column?')) return;
  
  const response = await fetch(
    `http://localhost:5000/kanban/columns/${columnId}/delete`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );
  
  return await response.json();
};
```

**Ví dụ cURL:**
```bash
curl -X POST http://localhost:5000/kanban/columns/col_123/delete \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 🔄 POST `/kanban/columns/reorder`

**Mô tả:** Sắp xếp lại thứ tự các columns (drag & drop).

**Authentication:** Required (JWT)

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "columnOrder": ["col_3", "col_1", "col_2"]
}
```

**Response:**
```json
{
  "status": 200,
  "message": "Columns reordered successfully",
  "data": [
    {
      "id": "col_3",
      "name": "Done",
      "order": 0
    },
    {
      "id": "col_1",
      "name": "To Do",
      "order": 1
    },
    {
      "id": "col_2",
      "name": "In Progress",
      "order": 2
    }
  ]
}
```

**Ví dụ Frontend:**
```javascript
// Using react-beautiful-dnd
const onDragEnd = async (result) => {
  if (!result.destination) return;
  
  const reorderedColumns = Array.from(columns);
  const [removed] = reorderedColumns.splice(result.source.index, 1);
  reorderedColumns.splice(result.destination.index, 0, removed);
  
  const columnOrder = reorderedColumns.map(col => col.id);
  
  await fetch('http://localhost:5000/kanban/columns/reorder', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ columnOrder })
  });
  
  setColumns(reorderedColumns);
};
```

---

### 📧 GET `/kanban/columns/:columnId/emails`

**Mô tả:** Lấy emails trong một custom column với filtering và sorting.

**Authentication:** Required (JWT)

**Path Parameters:**
- `columnId`: Custom column ID

**Query Parameters:**
- `limit` (optional): Số lượng emails
- `sortBy` (optional): `date-desc`, `date-asc`, `sender`
- `filterUnread` (optional): `true` để lọc chỉ unread
- `filterAttachment` (optional): `true` để lọc chỉ có attachment

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "columnId": "col_123",
    "columnName": "Review",
    "messages": [
      {
        "id": "msg_789",
        "subject": "PR Review Request",
        "from": "Dev Team <dev@example.com>",
        "snippet": "Please review pull request...",
        "isUnread": true
      }
    ],
    "total": 5
  }
}
```

**Ví dụ Frontend:**
```javascript
const loadColumnEmails = async (columnId, filters) => {
  const params = new URLSearchParams({
    limit: '50',
    ...filters
  });
  
  const response = await fetch(
    `http://localhost:5000/kanban/columns/${columnId}/emails?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );
  
  const data = await response.json();
  return data.data.messages;
};

// Usage
const reviewEmails = await loadColumnEmails('col_123', {
  sortBy: 'date-desc',
  filterUnread: 'true'
});
```

---

## 🔄 Label Mapping & Auto-Sync

**Concept:** Khi move email giữa các columns, backend tự động sync Gmail labels.

**Example Flow:**
```javascript
// User drags email from "To Do" → "Done"
// "To Do" column: gmailLabel = "STARRED"
// "Done" column: gmailLabel = null

// Backend automatically:
// 1. Remove STARRED label from email in Gmail
// 2. Update status in database

// User drags email to column with gmailLabel="IMPORTANT"
// Backend automatically:
// 1. Add IMPORTANT label in Gmail
// 2. Update database
```

**Configuration Example:**
```javascript
const labelMappingExamples = {
  "To Do": "STARRED",          // Mark as starred
  "In Progress": "IMPORTANT",  // Mark as important
  "Waiting": "Label_123",      // Custom Gmail label
  "Done": null,                // No label (DB only)
  "Archive": "TRASH"           // Move to trash
};
```

---

## 🎯 Summary Week 4 APIs

| Feature | Endpoints | Description |
|---------|-----------|-------------|
| **Semantic Search** | 1 API | Vector-based conceptual search |
| **Embedding Mgmt** | 2 APIs | Index emails + check stats |
| **Kanban Config** | 6 APIs | CRUD columns + label mapping |

**Total:** 9 new endpoints

**Key Features:**
- **Semantic Search**: Tìm kiếm theo ý nghĩa, không cần từ khóa chính xác
- **Vector Embeddings**: Sử dụng Gemini AI để generate embeddings
- **Custom Columns**: User tự định nghĩa workflow riêng
- **Label Sync**: Tự động sync với Gmail labels khi move emails

---

## 🔧 Environment Setup (Week 4)

**Required:**
```env
# Existing
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MONGODB_URI=...

# Week 4 - REQUIRED
GEMINI_API_KEY=your_gemini_api_key_here
```

**Get Gemini API Key:**
1. Visit https://ai.google.dev/
2. Click "Get API Key"
3. Create new project or select existing
4. Copy API key
5. Add to `.env`

---

## 📊 Complete API Summary (All Weeks)

| Week | Feature | Endpoints |
|------|---------|-----------|
| Week 1 | Auth + Basic Mail | 10 APIs |
| Week 2 | Kanban + AI Summary + Snooze | 7 APIs |
| **Week 3** | **Fuzzy Search + Filter/Sort** | **3 APIs** |
| **Week 4** | **Semantic Search + Config** | **9 APIs** |
| **Total** | | **29 APIs** |

---

*Week 4 APIs documented: December 17, 2025*

---

## 🚀 Quick Start Guide

### Week 3 Integration:
```javascript
// 1. Fuzzy search with typo tolerance
const results = await fetch('/search/fuzzy', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ query: 'marketting' }) // Typo tolerance
});

// 2. Auto-suggestions
const suggestions = await fetch(`/search/suggestions?q=Nguyen`);

// 3. Filter & sort
const filtered = await fetch(
  '/mailboxes/INBOX/emails/filtered?sortBy=date-desc&filterUnread=true'
);
```

### Week 4 Integration:
```javascript
// 1. Index emails (first time)
await fetch('/search/index', {
  method: 'POST',
  body: JSON.stringify({ limit: 100 })
});

// 2. Semantic search
const results = await fetch('/search/semantic', {
  method: 'POST',
  body: JSON.stringify({ query: 'financial reports' })
});
// Returns conceptually related emails

// 3. Custom Kanban
const config = await fetch('/kanban/config');
await fetch('/kanban/columns', {
  method: 'POST',
  body: JSON.stringify({ name: 'Review', gmailLabel: 'IMPORTANT' })
});
```

---

*Complete API documentation: Weeks 1-4*

---
---

# 🔍 WEEK 3 APIs - Fuzzy Search & Filtering

> **⚠️ CHÚ Ý:** APIs dưới đây là phần mở rộng cho TUẦN 3, tập trung vào tìm kiếm thông minh và lọc/sắp xếp email.

---

## 📋 Mục lục Week 3 APIs

1. [Fuzzy Search APIs](#fuzzy-search-apis)
2. [Search Suggestions API](#search-suggestions-api)
3. [Filtering & Sorting APIs](#filtering--sorting-apis)
4. [Testing Examples](#testing-examples-week-3)

---

## 1️⃣ Fuzzy Search APIs

> **🎯 Mục đích:** Tìm kiếm email với khả năng chịu lỗi đánh máy (typo tolerance) và khớp một phần (partial matching). Không cần gõ đúng 100% từ khóa.

---

### 🔍 POST `/search/fuzzy`

**Mô tả:** Thực hiện tìm kiếm fuzzy trên subject, sender (name + email), và body (optional)

**Authentication:** Required (JWT)

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "query": "marketing",
  "limit": 20,
  "includeBody": false
}
```

**Fields:**
- `query` (required): Từ khóa tìm kiếm
- `limit` (optional, default=50): Số kết quả tối đa
- `includeBody` (optional, default=false): Có tìm trong nội dung email không (chậm hơn)

**Response:**
```json
{
  "status": 200,
  "data": {
    "query": "marketing",
    "results": [
      {
        "id": "msg_123",
        "threadId": "thread_456",
        "subject": "New Marketing Campaign",
        "from": "marketing@example.com",
        "date": "2025-12-17T10:00:00Z",
        "snippet": "We are launching a new marketing initiative...",
        "isUnread": true,
        "hasAttachment": false,
        "relevanceScore": 0.95
      }
    ],
    "totalResults": 8
  }
}
```

**Response Fields:**
- `relevanceScore`: Độ liên quan (0-1), càng cao càng khớp
- Kết quả được sắp xếp theo `relevanceScore` giảm dần

**Typo Tolerance Examples:**
- Query: `"markting"` → Tìm được emails về "marketing"
- Query: `"recieve"` → Tìm được emails về "receive"
- Query: `"Nguy"` → Tìm được senders như "Nguyễn Văn A"

**Partial Matching Examples:**
- Query: `"john"` → Tìm được "john@example.com", "John Doe", "Johnny Smith"
- Query: `"inv"` → Tìm được emails về "invoice", "invitation", "inventory"

**Ví dụ Frontend:**
```javascript
const fuzzySearch = async (query) => {
  const response = await fetch('http://localhost:5000/search/fuzzy', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      limit: 20,
      includeBody: false // Set true for more accurate results (slower)
    })
  });

  const data = await response.json();
  
  // Display results
  data.data.results.forEach(email => {
    console.log(`[${email.relevanceScore.toFixed(2)}] ${email.subject}`);
  });
  
  return data.data.results;
};

// Usage
await fuzzySearch('marketing');
```

**Ví dụ cURL:**
```bash
curl -X POST http://localhost:5000/search/fuzzy \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "markting",
    "limit": 20,
    "includeBody": false
  }'
```

---

## 2️⃣ Search Suggestions API

> **🎯 Mục đích:** Cung cấp gợi ý tìm kiếm khi user đang gõ (auto-suggestion/type-ahead).

---

### 💡 GET `/search/suggestions?q={query}`

**Mô tả:** Lấy danh sách gợi ý search dựa trên query

**Authentication:** Required (JWT)

**Query Parameters:**
- `q` (required): Query string (tối thiểu 2 ký tự)

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "suggestions": [
      "marketing@example.com",
      "Marketing Team",
      "marketing campaign",
      "New Marketing Strategy",
      "Marketing Budget"
    ]
  }
}
```

**Suggestions Include:**
- Sender names và emails khớp với query
- Keywords từ subject khớp với query
- Tối đa 10 suggestions

**Ví dụ Frontend (Auto-complete Search Bar):**
```javascript
// Debounced search suggestions
let suggestionTimeout;

const searchInput = document.getElementById('search-input');
const suggestionsDiv = document.getElementById('suggestions');

searchInput.addEventListener('input', (e) => {
  const query = e.target.value.trim();
  
  clearTimeout(suggestionTimeout);
  
  if (query.length < 2) {
    suggestionsDiv.innerHTML = '';
    return;
  }
  
  suggestionTimeout = setTimeout(async () => {
    const response = await fetch(
      `http://localhost:5000/search/suggestions?q=${encodeURIComponent(query)}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    
    const data = await response.json();
    
    // Display suggestions dropdown
    suggestionsDiv.innerHTML = data.data.suggestions
      .map(s => `<div class="suggestion-item">${s}</div>`)
      .join('');
  }, 300); // 300ms debounce
});

// Click suggestion → trigger search
suggestionsDiv.addEventListener('click', (e) => {
  if (e.target.classList.contains('suggestion-item')) {
    const selectedQuery = e.target.textContent;
    searchInput.value = selectedQuery;
    performFuzzySearch(selectedQuery);
  }
});
```

**Ví dụ cURL:**
```bash
curl "http://localhost:5000/search/suggestions?q=mark" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 3️⃣ Filtering & Sorting APIs

> **🎯 Mục đích:** Lọc và sắp xếp emails trong Kanban columns hoặc mailboxes.

---

### 📊 GET `/mailboxes/:id/emails/filtered`

**Mô tả:** Lấy emails từ mailbox/label với filtering và sorting

**Authentication:** Required (JWT)

**Path Parameters:**
- `:id` - Label ID (e.g., `INBOX`, `SENT`, custom label ID)

**Query Parameters:**
- `sortBy` (optional): 
  - `date-desc` - Mới nhất trước (default)
  - `date-asc` - Cũ nhất trước
  - `sender` - Sắp xếp theo tên người gửi
- `filterUnread` (optional): `true` | `false` - Chỉ hiển thị emails chưa đọc
- `filterAttachment` (optional): `true` | `false` - Chỉ hiển thị emails có đính kèm
- `limit` (optional, default=50): Số lượng emails
- `pageToken` (optional): Token cho pagination

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
        "id": "msg_123",
        "subject": "Important Document",
        "from": "boss@example.com",
        "date": "2025-12-17T14:30:00Z",
        "isUnread": true,
        "hasAttachment": true,
        "snippet": "Please review the attached document..."
      }
    ],
    "nextPageToken": "page_token_xyz",
    "resultSizeEstimate": 42
  }
}
```

**Ví dụ Frontend (Kanban Board với Filters):**
```javascript
const loadColumnWithFilters = async (labelId, filters) => {
  const params = new URLSearchParams({
    limit: 50,
    sortBy: filters.sortBy || 'date-desc',
  });
  
  if (filters.showUnreadOnly) {
    params.append('filterUnread', 'true');
  }
  
  if (filters.showAttachmentsOnly) {
    params.append('filterAttachment', 'true');
  }
  
  const response = await fetch(
    `http://localhost:5000/mailboxes/${labelId}/emails/filtered?${params}`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  
  const data = await response.json();
  return data.data.messages;
};

// UI Controls
const filterControls = {
  sortBy: 'date-desc', // 'date-desc' | 'date-asc' | 'sender'
  showUnreadOnly: false,
  showAttachmentsOnly: false,
};

// Apply filters
document.getElementById('sort-select').addEventListener('change', (e) => {
  filterControls.sortBy = e.target.value;
  refreshColumn();
});

document.getElementById('filter-unread').addEventListener('change', (e) => {
  filterControls.showUnreadOnly = e.target.checked;
  refreshColumn();
});

document.getElementById('filter-attachments').addEventListener('change', (e) => {
  filterControls.showAttachmentsOnly = e.target.checked;
  refreshColumn();
});

async function refreshColumn() {
  const emails = await loadColumnWithFilters('INBOX', filterControls);
  renderEmailCards(emails);
}
```

**Ví dụ cURL:**
```bash
# Get unread emails sorted by date (newest first)
curl "http://localhost:5000/mailboxes/INBOX/emails/filtered?sortBy=date-desc&filterUnread=true&limit=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Get emails with attachments sorted by sender
curl "http://localhost:5000/mailboxes/INBOX/emails/filtered?sortBy=sender&filterAttachment=true" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 4️⃣ Testing Examples (Week 3)

### Complete Search Flow:

```bash
# 1. Get search suggestions
curl "http://localhost:5000/search/suggestions?q=mar" \
  -H "Authorization: Bearer YOUR_JWT"
# → Returns: ["marketing@example.com", "Marketing Team", ...]

# 2. Perform fuzzy search with typo
curl -X POST http://localhost:5000/search/fuzzy \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"query":"markting","limit":10}'
# → Finds emails about "marketing" despite typo

# 3. Search with partial match
curl -X POST http://localhost:5000/search/fuzzy \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"query":"Nguy","limit":10}'
# → Finds all senders starting with "Nguy" (e.g., Nguyễn)
```

### Complete Filtering Flow:

```bash
# 1. Get all emails in INBOX (default sort)
curl "http://localhost:5000/mailboxes/INBOX/emails/filtered" \
  -H "Authorization: Bearer YOUR_JWT"

# 2. Filter: Only unread emails, sorted newest first
curl "http://localhost:5000/mailboxes/INBOX/emails/filtered?filterUnread=true&sortBy=date-desc" \
  -H "Authorization: Bearer YOUR_JWT"

# 3. Filter: Only emails with attachments, sorted by sender
curl "http://localhost:5000/mailboxes/INBOX/emails/filtered?filterAttachment=true&sortBy=sender" \
  -H "Authorization: Bearer YOUR_JWT"

# 4. Combine filters: Unread + Attachments, sorted oldest first
curl "http://localhost:5000/mailboxes/INBOX/emails/filtered?filterUnread=true&filterAttachment=true&sortBy=date-asc" \
  -H "Authorization: Bearer YOUR_JWT"
```

---

## 🎯 Summary Week 3 APIs

| Category | Endpoints | Description |
|----------|-----------|-------------|
| **Fuzzy Search** | 1 API | Typo-tolerant search với relevance scoring |
| **Auto-Suggestion** | 1 API | Real-time search suggestions |
| **Filtering & Sorting** | 1 API | Filter by unread/attachment, sort by date/sender |

**Total:** 3 new endpoints

**Key Features:**
- **Typo Tolerance**: "markting" → finds "marketing"
- **Partial Match**: "Nguy" → finds "Nguyễn Văn A"
- **Relevance Scoring**: Results ranked by best match first
- **Real-time Suggestions**: Type-ahead autocomplete
- **Flexible Filtering**: Unread, attachments, custom combinations
- **Multiple Sorting**: Date (asc/desc), sender name

---

*Last updated: December 17, 2025 - Week 3 Implementation*

---
---

# 🧠 WEEK 4 APIs - Semantic Search & Dynamic Kanban

> **⚠️ CHÚ Ý:** APIs dưới đây là phần mở rộng cho TUẦN 4, bao gồm tìm kiếm ngữ nghĩa (semantic search) và cấu hình Kanban động.

---

## 📋 Mục lục Week 4 APIs

1. [Semantic Search APIs](#semantic-search-apis)
2. [Email Indexing APIs](#email-indexing-apis)
3. [Kanban Configuration APIs](#kanban-configuration-apis)
4. [Testing Examples](#testing-examples-week-4)
5. [Environment Setup](#environment-setup-week-4)

---

## 1️⃣ Semantic Search APIs

> **🎯 Mục đích:** Tìm kiếm dựa trên **ý nghĩa** (semantic meaning) chứ không phải chỉ từ khóa. Sử dụng vector embeddings để tìm emails liên quan về mặt khái niệm.

**Ví dụ:**
- Query: `"financial matters"` → Tìm emails về "invoice", "payment", "salary", "budget"
- Query: `"urgent tasks"` → Tìm emails về "deadline", "ASAP", "priority", "critical"

---

### 🔍 POST `/search/semantic`

**Mô tả:** Thực hiện tìm kiếm ngữ nghĩa sử dụng vector embeddings

**Authentication:** Required (JWT)

**⚠️ Prerequisites:** 
- Emails must be indexed first (see `/search/index` endpoint)
- `GEMINI_API_KEY` must be set in `.env`

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "query": "financial matters",
  "limit": 20,
  "threshold": 0.5
}
```

**Fields:**
- `query` (required): Câu query ngữ nghĩa (có thể là câu dài, khái niệm)
- `limit` (optional, default=20): Số kết quả tối đa
- `threshold` (optional, default=0.5): Ngưỡng similarity (0-1), càng cao càng khắt khe

**Response:**
```json
{
  "status": 200,
  "data": {
    "query": "financial matters",
    "results": [
      {
        "id": "msg_789",
        "threadId": "thread_012",
        "subject": "Q4 Budget Review",
        "from": "finance@example.com",
        "date": "2025-12-15T09:00:00Z",
        "snippet": "Please review the quarterly budget allocation...",
        "similarityScore": 0.87,
        "matchedText": "Q4 Budget Review Please review the quarterly budget..."
      },
      {
        "id": "msg_456",
        "subject": "Invoice Payment Due",
        "from": "accounting@example.com",
        "similarityScore": 0.82,
        "matchedText": "Invoice Payment Due Your payment is due by..."
      }
    ],
    "totalResults": 12,
    "searchedEmails": 150
  }
}
```

**Response Fields:**
- `similarityScore`: Độ tương đồng ngữ nghĩa (0-1), càng cao càng liên quan
- `matchedText`: Đoạn text đã được dùng để tạo embedding
- `searchedEmails`: Tổng số emails đã được indexed

**Conceptual Search Examples:**
- Query: `"money"` → Finds: "invoice", "payment", "salary", "budget", "cost"
- Query: `"meeting schedule"` → Finds: "appointment", "calendar", "conference", "agenda"
- Query: `"customer complaints"` → Finds: "feedback", "issue", "problem", "dissatisfied"

**Ví dụ Frontend:**
```javascript
const semanticSearch = async (query) => {
  // Check if emails are indexed first
  const statsResponse = await fetch('http://localhost:5000/search/index/stats', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const stats = await statsResponse.json();
  
  if (stats.data.indexedEmails === 0) {
    alert('Please index your emails first!');
    // Trigger indexing
    await indexEmails();
    return;
  }
  
  // Perform semantic search
  const response = await fetch('http://localhost:5000/search/semantic', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      limit: 20,
      threshold: 0.5 // Adjust for more/less strict matching
    })
  });

  const data = await response.json();
  
  // Display results
  console.log(`Found ${data.data.totalResults} related emails:`);
  data.data.results.forEach(email => {
    console.log(`[${(email.similarityScore * 100).toFixed(0)}%] ${email.subject}`);
  });
  
  return data.data.results;
};

// Usage
await semanticSearch('financial matters');
await semanticSearch('urgent tasks that need attention');
```

**Ví dụ cURL:**
```bash
curl -X POST http://localhost:5000/search/semantic \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "financial matters",
    "limit": 20,
    "threshold": 0.5
  }'
```

---

## 2️⃣ Email Indexing APIs

> **🎯 Mục đích:** Generate và lưu trữ vector embeddings cho emails để support semantic search.

---

### 📥 POST `/search/index`

**Mô tả:** Index (generate embeddings) cho emails trong inbox

**Authentication:** Required (JWT)

**⚠️ Note:** 
- Process có thể mất vài phút tùy số lượng emails
- Chỉ cần chạy 1 lần hoặc khi có emails mới
- Rate limit: ~60 emails/minute (Gemini API limit)

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "limit": 100
}
```

**Fields:**
- `limit` (optional, default=100): Số emails tối đa cần index

**Response:**
```json
{
  "status": 200,
  "message": "Successfully indexed 100 emails",
  "indexed": 100
}
```

**Ví dụ Frontend:**
```javascript
const indexEmails = async (limit = 100) => {
  // Show loading indicator
  showLoadingSpinner('Indexing emails for semantic search...');
  
  const response = await fetch('http://localhost:5000/search/index', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ limit })
  });

  const data = await response.json();
  
  hideLoadingSpinner();
  
  if (data.status === 200) {
    alert(`Successfully indexed ${data.indexed} emails!`);
  }
  
  return data;
};

// Run indexing on first app load or manually
document.getElementById('btn-index-emails').addEventListener('click', () => {
  indexEmails(100);
});
```

**Ví dụ cURL:**
```bash
# Index 100 emails
curl -X POST http://localhost:5000/search/index \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100}'
```

---

### 📊 GET `/search/index/stats`

**Mô tả:** Lấy thống kê về indexing progress

**Authentication:** Required (JWT)

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "totalEmails": 150,
    "indexedEmails": 100,
    "pendingIndexing": 50,
    "indexingProgress": 66.67
  }
}
```

**Response Fields:**
- `totalEmails`: Tổng số emails trong database
- `indexedEmails`: Số emails đã có embeddings
- `pendingIndexing`: Số emails chưa index
- `indexingProgress`: % hoàn thành (0-100)

**Ví dụ Frontend:**
```javascript
const showIndexingStats = async () => {
  const response = await fetch('http://localhost:5000/search/index/stats', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  const data = await response.json();
  const stats = data.data;
  
  // Display progress bar
  document.getElementById('index-progress').style.width = `${stats.indexingProgress}%`;
  document.getElementById('index-text').textContent = 
    `${stats.indexedEmails}/${stats.totalEmails} emails indexed`;
  
  // Show index button if needed
  if (stats.pendingIndexing > 0) {
    document.getElementById('btn-index-emails').style.display = 'block';
  }
};

// Check stats on page load
await showIndexingStats();
```

**Ví dụ cURL:**
```bash
curl http://localhost:5000/search/index/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 3️⃣ Kanban Configuration APIs

> **🎯 Mục đích:** Cho phép users tùy chỉnh Kanban board của họ - tạo, sửa, xóa columns và map với Gmail labels.

---

### ⚙️ GET `/kanban/config`

**Mô tả:** Lấy cấu hình Kanban board của user

**Authentication:** Required (JWT)

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "userId": "user_123",
    "columns": [
      {
        "id": "todo",
        "name": "To Do",
        "order": 0,
        "gmailLabel": "STARRED",
        "color": "#FFA500",
        "isVisible": true
      },
      {
        "id": "in_progress",
        "name": "In Progress",
        "order": 1,
        "gmailLabel": "IMPORTANT",
        "color": "#4169E1",
        "isVisible": true
      },
      {
        "id": "done",
        "name": "Done",
        "order": 2,
        "gmailLabel": null,
        "color": "#32CD32",
        "isVisible": true
      }
    ],
    "showInbox": true,
    "defaultSort": "date",
    "lastModified": "2025-12-17T10:00:00Z"
  }
}
```

**Response Fields:**
- `columns`: Danh sách các columns trên board
- `gmailLabel`: Gmail label được map với column này (null nếu không map)
- `order`: Thứ tự hiển thị
- `isVisible`: Column có được hiển thị không

**Ví dụ Frontend:**
```javascript
const loadKanbanConfig = async () => {
  const response = await fetch('http://localhost:5000/kanban/config', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  const data = await response.json();
  const config = data.data;
  
  // Render Kanban board based on config
  config.columns
    .filter(col => col.isVisible)
    .sort((a, b) => a.order - b.order)
    .forEach(col => {
      renderColumn(col);
    });
  
  return config;
};
```

**Ví dụ cURL:**
```bash
curl http://localhost:5000/kanban/config \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### ➕ POST `/kanban/columns`

**Mô tả:** Tạo column mới trên Kanban board

**Authentication:** Required (JWT)

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Review",
  "gmailLabel": "Label_Review_123",
  "color": "#9370DB"
}
```

**Fields:**
- `name` (required): Tên column
- `gmailLabel` (optional): Gmail label ID để sync
- `color` (optional): Màu column (hex color)

**Response:**
```json
{
  "status": 201,
  "message": "Column created successfully",
  "data": {
    "id": "col_1702814400000",
    "name": "Review",
    "order": 3,
    "gmailLabel": "Label_Review_123",
    "color": "#9370DB",
    "isVisible": true
  }
}
```

**Ví dụ Frontend:**
```javascript
const createColumn = async (columnData) => {
  const response = await fetch('http://localhost:5000/kanban/columns', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: columnData.name,
      gmailLabel: columnData.gmailLabel || null,
      color: columnData.color || '#808080'
    })
  });

  const data = await response.json();
  
  if (data.status === 201) {
    // Add column to UI
    renderNewColumn(data.data);
  }
  
  return data;
};

// Usage
await createColumn({
  name: 'Review',
  gmailLabel: 'Label_123',
  color: '#9370DB'
});
```

**Ví dụ cURL:**
```bash
curl -X POST http://localhost:5000/kanban/columns \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Review",
    "gmailLabel": "Label_Review_123",
    "color": "#9370DB"
  }'
```

---

### ✏️ POST `/kanban/columns/:columnId`

**Mô tả:** Cập nhật column (rename, change label mapping, color, visibility)

**Authentication:** Required (JWT)

**Path Parameters:**
- `:columnId` - Column ID cần update

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Under Review",
  "gmailLabel": "IMPORTANT",
  "color": "#FF69B4",
  "isVisible": true
}
```

**Fields:** (tất cả optional - chỉ gửi fields cần update)
- `name`: Tên mới
- `gmailLabel`: Label mapping mới
- `color`: Màu mới
- `isVisible`: Hiển thị hoặc ẩn column

**Response:**
```json
{
  "status": 200,
  "message": "Column updated successfully",
  "data": {
    "id": "col_1702814400000",
    "name": "Under Review",
    "order": 3,
    "gmailLabel": "IMPORTANT",
    "color": "#FF69B4",
    "isVisible": true
  }
}
```

**Ví dụ Frontend:**
```javascript
const updateColumn = async (columnId, updates) => {
  const response = await fetch(`http://localhost:5000/kanban/columns/${columnId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });

  const data = await response.json();
  
  if (data.status === 200) {
    // Update UI
    updateColumnInUI(columnId, data.data);
  }
  
  return data;
};

// Usage examples
await updateColumn('todo', { name: 'Important Tasks' });
await updateColumn('todo', { gmailLabel: 'STARRED' });
await updateColumn('todo', { color: '#FF0000' });
await updateColumn('done', { isVisible: false }); // Hide column
```

**Ví dụ cURL:**
```bash
# Rename column
curl -X POST http://localhost:5000/kanban/columns/todo \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Important Tasks"}'

# Change label mapping
curl -X POST http://localhost:5000/kanban/columns/todo \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"gmailLabel": "STARRED"}'
```

---

### 🗑️ POST `/kanban/columns/:columnId/delete`

**Mô tả:** Xóa column khỏi Kanban board

**Authentication:** Required (JWT)

**Path Parameters:**
- `:columnId` - Column ID cần xóa

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": 200,
  "message": "Column deleted successfully"
}
```

**⚠️ Note:** Emails trong column bị xóa sẽ không bị xóa - chúng vẫn còn trong Gmail.

**Ví dụ Frontend:**
```javascript
const deleteColumn = async (columnId) => {
  if (!confirm('Are you sure you want to delete this column?')) {
    return;
  }
  
  const response = await fetch(`http://localhost:5000/kanban/columns/${columnId}/delete`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const data = await response.json();
  
  if (data.status === 200) {
    // Remove column from UI
    removeColumnFromUI(columnId);
  }
  
  return data;
};
```

**Ví dụ cURL:**
```bash
curl -X POST http://localhost:5000/kanban/columns/col_123/delete \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 🔄 POST `/kanban/columns/reorder`

**Mô tả:** Thay đổi thứ tự các columns

**Authentication:** Required (JWT)

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "columnOrder": ["done", "in_progress", "todo"]
}
```

**Fields:**
- `columnOrder` (required): Array of column IDs theo thứ tự mới

**Response:**
```json
{
  "status": 200,
  "message": "Columns reordered successfully",
  "data": [
    {
      "id": "done",
      "name": "Done",
      "order": 0
    },
    {
      "id": "in_progress",
      "name": "In Progress",
      "order": 1
    },
    {
      "id": "todo",
      "name": "To Do",
      "order": 2
    }
  ]
}
```

**Ví dụ Frontend (Drag & Drop Reorder):**
```javascript
const reorderColumns = async (newOrder) => {
  const response = await fetch('http://localhost:5000/kanban/columns/reorder', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ columnOrder: newOrder })
  });

  const data = await response.json();
  return data;
};

// Drag & Drop handler (using react-beautiful-dnd or similar)
const onColumnDragEnd = async (result) => {
  if (!result.destination) return;
  
  const items = Array.from(columns);
  const [reordered] = items.splice(result.source.index, 1);
  items.splice(result.destination.index, 0, reordered);
  
  const newOrder = items.map(col => col.id);
  
  // Update UI immediately
  setColumns(items);
  
  // Sync with backend
  await reorderColumns(newOrder);
};
```

**Ví dụ cURL:**
```bash
curl -X POST http://localhost:5000/kanban/columns/reorder \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "columnOrder": ["done", "in_progress", "todo"]
  }'
```

---

### 📋 GET `/kanban/columns/:columnId/emails`

**Mô tả:** Lấy emails của một custom column (với label mapping và filtering)

**Authentication:** Required (JWT)

**Path Parameters:**
- `:columnId` - Column ID

**Query Parameters:**
- `limit` (optional, default=50)
- `sortBy` (optional): `date-desc` | `date-asc`
- `filterUnread` (optional): `true` | `false`
- `filterAttachment` (optional): `true` | `false`

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "columnId": "todo",
    "columnName": "To Do",
    "messages": [
      {
        "id": "msg_123",
        "subject": "Task Assignment",
        "from": "manager@example.com",
        "date": "2025-12-17T10:00:00Z",
        "isUnread": true
      }
    ],
    "total": 5
  }
}
```

**⚠️ How Label Mapping Works:**
- Nếu column có `gmailLabel`: Fetch emails từ Gmail label đó
- Nếu column không có `gmailLabel`: Fetch từ database (custom status)

**Ví dụ Frontend:**
```javascript
const loadCustomColumnEmails = async (columnId, filters = {}) => {
  const params = new URLSearchParams({
    limit: 50,
    ...filters
  });
  
  const response = await fetch(
    `http://localhost:5000/kanban/columns/${columnId}/emails?${params}`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  
  const data = await response.json();
  return data.data.messages;
};

// Usage
const todoEmails = await loadCustomColumnEmails('todo', {
  sortBy: 'date-desc',
  filterUnread: true
});
```

**Ví dụ cURL:**
```bash
curl "http://localhost:5000/kanban/columns/todo/emails?limit=20&filterUnread=true" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 4️⃣ Testing Examples (Week 4)

### Complete Semantic Search Flow:

```bash
# 1. Check indexing stats
curl http://localhost:5000/search/index/stats \
  -H "Authorization: Bearer YOUR_JWT"
# → Shows: 0/150 emails indexed

# 2. Index emails (first time setup)
curl -X POST http://localhost:5000/search/index \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100}'
# → Indexes 100 emails (takes 1-2 minutes)

# 3. Perform semantic search
curl -X POST http://localhost:5000/search/semantic \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "financial matters and budget",
    "limit": 10,
    "threshold": 0.5
  }'
# → Returns emails about invoices, payments, costs, etc.

# 4. Try conceptual search
curl -X POST http://localhost:5000/search/semantic \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"query": "urgent tasks"}'
# → Returns emails about deadlines, priorities, ASAP, etc.
```

### Complete Kanban Configuration Flow:

```bash
# 1. Get current config
curl http://localhost:5000/kanban/config \
  -H "Authorization: Bearer YOUR_JWT"
# → Shows default columns: To Do, In Progress, Done

# 2. Create new column
curl -X POST http://localhost:5000/kanban/columns \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Review",
    "gmailLabel": "STARRED",
    "color": "#9370DB"
  }'
# → Creates "Review" column mapped to Gmail STARRED label

# 3. Update column (rename)
curl -X POST http://localhost:5000/kanban/columns/todo \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"name": "Backlog"}'
# → Renames "To Do" to "Backlog"

# 4. Change label mapping
curl -X POST http://localhost:5000/kanban/columns/todo \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"gmailLabel": "IMPORTANT"}'
# → Now "Backlog" shows emails with IMPORTANT label

# 5. Reorder columns
curl -X POST http://localhost:5000/kanban/columns/reorder \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"columnOrder": ["done", "in_progress", "todo"]}'
# → Changes display order

# 6. Delete column
curl -X POST http://localhost:5000/kanban/columns/col_review/delete \
  -H "Authorization: Bearer YOUR_JWT"
# → Deletes "Review" column (emails not affected)

# 7. Get emails from custom column
curl "http://localhost:5000/kanban/columns/todo/emails?limit=20" \
  -H "Authorization: Bearer YOUR_JWT"
# → Returns emails in "Backlog" column (from IMPORTANT label)
```

---

## 5️⃣ Environment Setup (Week 4)

### Required Environment Variables:

```env
# Existing (Week 1-3)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MONGODB_URI=...
GEMINI_API_KEY=...

# No new variables needed for Week 4
```

### Get Gemini API Key (if not already done):

1. Visit: https://ai.google.dev/
2. Click "Get API Key"
3. Create project or select existing
4. Copy API key
5. Add to `.env`: `GEMINI_API_KEY=AIzaSy...`

---

## 🎯 Summary Week 4 APIs

| Category | Endpoints | Description |
|----------|-----------|-------------|
| **Semantic Search** | 1 API | Vector-based conceptual search |
| **Email Indexing** | 2 APIs | Generate embeddings + stats |
| **Kanban Config** | 6 APIs | CRUD operations for columns + label mapping |

**Total:** 9 new endpoints

**Key Features:**
- **Semantic Search**: Tìm theo ý nghĩa, không cần từ khóa chính xác
- **Vector Embeddings**: Powered by Gemini API
- **Dynamic Columns**: Users tự tạo/sửa/xóa columns
- **Label Mapping**: Auto-sync với Gmail labels
- **Flexible Board**: Reorder columns, hide/show, custom colors

---

## 📊 Complete API Summary (All Weeks)

| Week | Features | Endpoints | Total |
|------|----------|-----------|-------|
| Week 1-2 | Auth, Mail, Kanban, AI, Snooze | ~15 APIs | 15 |
| Week 3 | Fuzzy Search, Filtering | 3 APIs | 3 |
| Week 4 | Semantic Search, Config | 9 APIs | 9 |
| **TOTAL** | | | **27 APIs** |

---

*Last updated: December 17, 2025 - Week 4 Implementation Complete*
