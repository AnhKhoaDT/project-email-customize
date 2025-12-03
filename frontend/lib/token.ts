// ========================================
// TOKEN MANAGEMENT UTILITIES
// ========================================
// SECURE STRATEGY (Production Best Practice):
// 
// - Access Token: IN-MEMORY ONLY (React Context)
//   → Never persisted to localStorage/cookies
//   → Lost on page refresh (must re-fetch via refresh token)
//   → Expires: 15 minutes (short-lived)
//   → 🔒 IMMUNE TO XSS ATTACKS
// 
// - Refresh Token: HttpOnly Cookie ONLY (server-side)
//   → Set by backend: res.cookie('refreshToken', ..., { httpOnly: true })
//   → Never accessible to JavaScript
//   → Expires: 7 days
//   → Can be revoked server-side via database tracking
//   → 🔒 IMMUNE TO XSS ATTACKS
// 
// SECURITY BENEFITS:
// ✅ Access token never stored persistently → XSS can't steal it
// ✅ Refresh token in HttpOnly cookie → JavaScript can't access it
// ✅ SameSite cookies → CSRF protection
// ✅ Short-lived access tokens → Limited damage window
// ✅ Server-side refresh token revocation → Remote logout capability
// 
// TRADE-OFFS:
// ⚠️ Access token lost on page refresh → Must call /auth/refresh on mount
// ⚠️ Slightly more complex initialization flow
// ✅ BUT: Maximum security - industry best practice
// ========================================

// No token constants needed - tokens are in-memory (context) or HttpOnly cookies

// Check if running in browser
const isBrowser = typeof window !== 'undefined';

// ========================================
// TOKEN MANAGEMENT - IN-MEMORY ONLY
// ========================================
// Access tokens are stored in React Context (auth-context.tsx)
// Refresh tokens are stored in HttpOnly cookies (server-side only)
// 
// This file now only manages USER DATA (non-sensitive info)
// ========================================

/**
 * DEPRECATED: Access token now stored in AuthContext (in-memory)
 * Use: const { accessToken } = useAuth()
 */
export const getAccessToken = (): string | null => {
  console.warn('[token.ts] getAccessToken() is deprecated. Access token is now in-memory (AuthContext).');
  return null;
};

/**
 * DEPRECATED: Access token now stored in AuthContext (in-memory)
 * Use: const { setAccessToken } = useAuth()
 */
export const setAccessToken = (token: string): void => {
  console.warn('[token.ts] setAccessToken() is deprecated. Access token is now in-memory (AuthContext).');
};

/**
 * DEPRECATED: Access token is in-memory, cleared by setting AuthContext to null
 */
export const clearAccessToken = (): void => {
  // No-op - access token is in-memory
};

/**
 * DEPRECATED: Refresh token now in HttpOnly cookie (server-side only)
 * Cookie is automatically sent with credentials: 'include'
 */
export const getRefreshToken = (): string | null => {
  console.warn('[token.ts] getRefreshToken() is deprecated. Refresh token is now HttpOnly cookie.');
  return null;
};

/**
 * DEPRECATED: Refresh token now in HttpOnly cookie (server-side only)
 * Backend sets cookie: res.cookie('refreshToken', ..., { httpOnly: true })
 */
export const setRefreshToken = (token: string): void => {
  console.warn('[token.ts] setRefreshToken() is deprecated. Refresh token is now HttpOnly cookie.');
};

/**
 * DEPRECATED: Refresh token is HttpOnly cookie, cleared by backend on logout
 */
export const clearRefreshToken = (): void => {
  // No-op - refresh token is HttpOnly cookie, cleared by backend
};

/**
 * Clear all auth-related data
 * Now only clears user data (tokens are in-memory/HttpOnly)
 */
export const clearTokens = (): void => {
  clearUserData();
};

/**
 * Check if user has valid session
 * Now relies on AuthContext state instead of localStorage
 */
export const hasTokens = (): boolean => {
  // This is now handled by AuthContext.isAuthenticated
  return false;
};

// ========================================
// USER DATA MANAGEMENT
// ========================================

const USER_DATA = 'user_data';

/**
 * Save user data to localStorage
 * Persist user info across page reloads
 */
export const saveUserData = (user: any): void => {
  if (!isBrowser) return;
  try {
    localStorage.setItem(USER_DATA, JSON.stringify(user));
  } catch (error) {
    console.error('Failed to save user data:', error);
  }
};

/**
 * Get user data from localStorage
 * Returns null if no data or parse error
 */
export const getUserData = (): any | null => {
  if (!isBrowser) return null;
  try {
    const data = localStorage.getItem(USER_DATA);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Failed to parse user data:', error);
    return null;
  }
};

/**
 * Clear user data from localStorage
 */
export const clearUserData = (): void => {
  if (!isBrowser) return;
  localStorage.removeItem(USER_DATA);
};
