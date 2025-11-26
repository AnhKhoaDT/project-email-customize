Minimal React frontend for OAuth demo

Run:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` and click the "Sign in with Google" button. The button redirects to your backend `GET /auth/google`, backend handles Google consent and will redirect back to the frontend with tokens in the URL fragment. The frontend parses them and displays user/profile if available.

Notes:
- This example stores tokens in localStorage for demo only (NOT secure). Production should use HttpOnly secure cookies for refresh tokens.
- Backend base URL is assumed `http://localhost:5000`. Update code if backend runs elsewhere.
