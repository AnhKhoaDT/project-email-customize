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
