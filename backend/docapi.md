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
