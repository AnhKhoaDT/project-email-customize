import React, {useEffect, useState} from 'react'

function Login() {
  return (
    <div className="center">
      <h1>Mail App — Login</h1>
      <p>
        <button className="google" onClick={() => { window.location.href = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000') + '/auth/google' }}>
          Sign in with Google
        </button>
      </p>
      <p className="hint">Backend will handle OAuth and redirect back here with tokens.</p>
    </div>
  )
}

function Home({ tokens, user }) {
  return (
    <div className="center">
      <h1>Welcome</h1>
      {user ? <p>Signed in as <strong>{user.email}</strong></p> : <p>Signed in</p>}
      <div className="tokens">
        <h3>Tokens (store securely in app)</h3>
        <pre>{JSON.stringify(tokens, null, 2)}</pre>
      </div>
      <p>
        <button onClick={() => { 
            // call backend logout to clear session & cookie
            fetch((import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000') + '/auth/logout', { method: 'POST', credentials: 'include' }).catch(()=>{});
            localStorage.removeItem('app_tokens'); window.location.href='/' 
          }}>Sign out</button>
      </p>
    </div>
  )
}

export default function App(){
  const [tokens, setTokens] = useState(null)
  const [user, setUser] = useState(null)

  useEffect(()=>{
    // If backend redirected with ?auth=success the refresh token cookie was set.
    // Call backend /auth/refresh (with credentials) to obtain a short-lived access token.
    const params = new URLSearchParams(window.location.search);
    const backend = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    if (params.get('auth') === 'success') {
      fetch(backend + '/auth/refresh', { method: 'POST', credentials: 'include' })
        .then(r => r.json())
        .then(j => {
          if (j && j.accessToken) {
            const t = { accessToken: j.accessToken };
            setTokens(t);
            localStorage.setItem('app_tokens', JSON.stringify(t));
            // cleanup URL
            history.replaceState(null, '', window.location.pathname);
            // fetch user
            return fetch(backend + '/users/me', { headers: { 'Authorization': `Bearer ${t.accessToken}` } , credentials: 'include'})
          }
        })
        .then(r => r && r.json())
        .then(j => j && setUser(j))
        .catch(()=>{});
      return;
    }

    // fallback: try load from localStorage
    const stored = localStorage.getItem('app_tokens')
    if (stored) {
      try{
        const t = JSON.parse(stored)
        setTokens(t)
        // try fetch profile
        fetch((import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000') + '/users/me', { headers: { 'Authorization': `Bearer ${t.accessToken}` }, credentials: 'include' }).then(r=>r.json()).then(j=>setUser(j)).catch(()=>{})
      }catch(e){}
    }
  }, [])

  if (!tokens) return <Login />
  return <Home tokens={tokens} user={user} />
}
