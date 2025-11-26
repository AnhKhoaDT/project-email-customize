// ========================================
// TOKEN MANAGEMENT UTILITIES
// ========================================
// STRATEGY (Per Assignment Requirements):
// 
// - Access Token: localStorage + Cookie
//   → localStorage: Primary storage, persists across page refresh
//   → Cookie: Enables Next.js middleware to read token for route protection
//   → Expires: 15 minutes (short-lived)
// 
// - Refresh Token: localStorage
//   → Per assignment requirement: "Store refresh token in persistent storage (e.g., localStorage)"
//   → Allows user session to persist across browser refresh
//   → Expires: 7 days
//   → Can be revoked server-side via database tracking
// 
// SECURITY CONSIDERATIONS:
// ✅ Short-lived access tokens (15 min) limit exposure window
// ✅ Refresh tokens can be revoked remotely in database
// ✅ Both tokens cleared on logout
// ✅ HTTPS in production prevents token interception
// ✅ Content Security Policy (CSP) mitigates XSS attacks
// ✅ SameSite cookies provide CSRF protection
// 
// NOTE: HttpOnly cookies (stretch goal) are used in Google OAuth flow
// for enhanced security, but assignment requires localStorage for standard auth.
// ========================================

// Constants
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// Check if running in browser
const isBrowser = typeof window !== 'undefined';

// ========================================
// COOKIE HELPERS
// ========================================

/**
 * Set cookie cho access token
 * CHÚ Ý: Chỉ dùng cho access token để middleware có thể đọc
 * KHÔNG dùng cho refresh token (refresh token phải là HTTP-only từ backend)
 */
const setCookie = (name: string, value: string, hours: number = 24): void => {
  if (!isBrowser) return;
  
  const expires = new Date();
  expires.setTime(expires.getTime() + hours * 60 * 60 * 1000);
  
  // SameSite=Lax: Protection against CSRF
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
};

/**
 * Get cookie by name
 */
const getCookie = (name: string): string | null => {
  if (!isBrowser) return null;
  
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) {
      return c.substring(nameEQ.length, c.length);
    }
  }
  
  return null;
};

/**
 * Delete cookie by setting expiration to past
 */
const deleteCookie = (name: string): void => {
  if (!isBrowser) return;
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
};

// ========================================
// TOKEN MANAGEMENT - PUBLIC API
// ========================================

/**
 * Get access token
 * Ưu tiên: localStorage > Cookie
 * 
 * Tại sao?
 * - localStorage: Fast, primary storage
 * - Cookie: Fallback cho middleware/SSR
 */
export const getAccessToken = (): string | null => {
  if (!isBrowser) return null;
  
  // Try localStorage first (faster + persists)
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) return token;
  
  // Fallback to cookie
  return getCookie(ACCESS_TOKEN_KEY);
};

/**
 * Set access token
 * Lưu vào: localStorage + Cookie
 * 
 * localStorage: 
 * - Primary storage
 * - Persist qua F5 (good UX!)
 * - Fast access
 * 
 * Cookie:
 * - Cho Next.js middleware đọc
 * - Server-side rendering support
 * - Expires cùng lúc với token
 */
export const setAccessToken = (token: string): void => {
  if (!isBrowser) return;
  
  // Set in localStorage (primary)
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  
  // Set in cookie (cho middleware - expires in 15 minutes)
  setCookie(ACCESS_TOKEN_KEY, token, 0.25); // 0.25 hours = 15 minutes
};

/**
 * Clear access token from both localStorage and cookies
 */
export const clearAccessToken = (): void => {
  if (!isBrowser) return;
  
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  deleteCookie(ACCESS_TOKEN_KEY);
};

/**
 * Get refresh token from localStorage
 * Per assignment requirement: refresh token stored in localStorage
 */
export const getRefreshToken = (): string | null => {
  if (!isBrowser) return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
};

/**
 * Set refresh token in localStorage
 * Per assignment requirement: refresh token stored in localStorage
 */
export const setRefreshToken = (token: string): void => {
  if (!isBrowser) return;
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
};

/**
 * Clear refresh token from localStorage
 */
export const clearRefreshToken = (): void => {
  if (!isBrowser) return;
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

/**
 * Clear all tokens and user data
 * 
 * Frontend: Clear both access token and refresh token from localStorage
 * Also clear user data for complete logout
 */
export const clearTokens = (): void => {
  clearAccessToken();
  clearRefreshToken();
  clearUserData();
};

/**
 * Check if user has valid tokens
 * Check for access token (primary) or refresh token (for session restoration)
 */
export const hasTokens = (): boolean => {
  return !!getAccessToken() || !!getRefreshToken();
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
