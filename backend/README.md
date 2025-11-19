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

2. Run in development mode:

```bash
npm run start:dev
```

The server listens on `http://localhost:4000` by default.

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
