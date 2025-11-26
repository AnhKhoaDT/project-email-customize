# Email Customize - Frontend

A React/Next.js application implementing secure authentication (Email+Password + Google Sign-In) with a 3-column email dashboard mockup.

## Features

- ✅ Email/Password authentication with validation
- ✅ Google OAuth Sign-In integration
- ✅ Secure token management (access + refresh tokens)
- ✅ Automatic token refresh on expiration
- ✅ Protected routes with authentication guards
- ✅ 3-column email dashboard mockup
- ✅ Responsive design with dark mode support

## Tech Stack

- **Framework:** Next.js 16 with App Router
- **Language:** TypeScript
- **UI Components:** Shadcn/ui + Tailwind CSS
- **Form Handling:** React Hook Form + Zod validation
- **HTTP Client:** Axios with interceptors
- **State Management:** React Context + Custom Hooks

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Backend server running on `http://localhost:4000`

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Create `.env` file in the root directory:

```bash
BASE_URL="http://localhost:3000"
BACKEND_API_URL="http://localhost:4000"
```

### Development

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Token Storage Strategy

### Access Token
**Storage:** `localStorage` + cookie (non-HttpOnly)

**Justification:**
- **localStorage**: Primary storage for fast access and persistence across page refreshes
- **Cookie**: Enables Next.js middleware to read token for server-side route protection
- **Lifetime**: 15 minutes (short-lived to limit exposure window)

### Refresh Token
**Storage:** `localStorage`

**Justification (Per Assignment Requirement):**

The assignment explicitly requires storing the refresh token in persistent storage (localStorage). This approach was chosen for the following reasons:

1. **Assignment Compliance**: Meets the requirement "Store refresh token in persistent storage (e.g., localStorage)"

2. **User Experience**: Allows session persistence across browser refreshes and tab reopening without requiring re-login

3. **Simplicity**: Client-side token management is straightforward and doesn't require complex backend cookie handling

4. **Flexibility**: Frontend has full control over token lifecycle

5. **Backend Compatibility**: Backend accepts refresh tokens in request body, providing flexibility for different client implementations

### Security Considerations

While localStorage is vulnerable to XSS attacks, we mitigate this risk through:

- ✅ **Short-lived access tokens** (15 min) - limits the damage window if compromised
- ✅ **Token revocation** - refresh tokens can be revoked server-side via database tracking
- ✅ **Secure transmission** - HTTPS in production prevents token interception
- ✅ **Content Security Policy** - CSP headers prevent XSS injection
- ✅ **Input sanitization** - all user inputs are validated and sanitized
- ✅ **Logout clears tokens** - both tokens removed from localStorage on logout
- ✅ **Token rotation** - refresh tokens are rotated on each refresh call (backend implementation)

### Stretch Goal Implementation

For enhanced security in the Google OAuth flow, we've implemented **HttpOnly cookies** as a stretch goal:
- Google OAuth refresh tokens are stored in HttpOnly cookies (backend-managed)
- This provides XSS protection for OAuth tokens while maintaining assignment compliance for email/password auth

### Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| **localStorage (Current)** | ✅ Simple client-side control<br>✅ Meets assignment requirement<br>✅ Cross-tab access<br>✅ Persistent across refresh | ⚠️ Vulnerable to XSS (mitigated by CSP)<br>⚠️ Accessible to JavaScript |
| **HttpOnly Cookie (Stretch)** | ✅ XSS-proof<br>✅ Backend-controlled<br>✅ Automatic sending | ❌ More complex setup<br>❌ CORS configuration required<br>❌ No cross-domain support |

## Project Structure

```
frontend/
├── app/                      # Next.js App Router
│   ├── (auth)/              # Authentication pages (login, register)
│   ├── inbox/               # Protected email dashboard
│   └── layout.tsx           # Root layout with providers
├── components/              # Reusable UI components
│   ├── ui/                  # Shadcn/ui components
│   └── auth-initializer.tsx # Auth state initialization
├── contexts/                # React contexts
│   └── auth-context.tsx     # Authentication state management
├── hooks/                   # Custom React hooks
│   ├── useLoginMutation.ts
│   ├── useLogoutMutation.ts
│   └── useUserQuery.ts
├── lib/                     # Utility libraries
│   ├── api.ts               # Axios instance with interceptors
│   ├── auth.ts              # Authentication API functions
│   ├── token.ts             # Token management utilities
│   └── utils.ts             # General utilities
└── types/                   # TypeScript type definitions
    └── auth.types.ts        # Authentication types
```

## Authentication Flow

### Email/Password Login
1. User submits credentials via login form
2. Client validates input (Zod schema)
3. POST `/auth/login` to backend
4. Backend validates and returns `{ accessToken, refreshToken, user }`
5. Frontend saves both tokens to localStorage
6. User redirected to `/inbox`

### Token Refresh (Automatic)
1. Protected API request returns 401 Unauthorized
2. Axios interceptor catches the error
3. Gets `refreshToken` from localStorage
4. POST `/auth/refresh` with `{ refreshToken }` in body
5. Backend validates and returns new `accessToken`
6. Original request retried with new token
7. If refresh fails → clear tokens and redirect to `/login`

### Logout
1. User clicks logout button
2. POST `/auth/logout` to backend (backend revokes refresh token)
3. Frontend clears both tokens from localStorage
4. User redirected to `/login`

## API Integration

The frontend communicates with a backend API running on `http://localhost:4000`.

### Key Endpoints

- `POST /auth/login` - Email/password login
- `POST /auth/register` - User registration
- `POST /auth/google` - Google OAuth login
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout and revoke tokens
- `GET /auth/me` - Get current user profile

### Request Interceptor

All API requests automatically include the access token:
```typescript
Authorization: Bearer <accessToken>
```

### Response Interceptor

Handles 401 errors with automatic token refresh and request retry with concurrency support.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
