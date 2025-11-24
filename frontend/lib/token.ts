// ========================================
// TOKEN MANAGEMENT UTILITIES
// ========================================
// STRATEGY (Best Balance: Security + UX):
// - Access Token: localStorage + Cookie
//   → localStorage: Fast access, persist qua F5 (good UX)
//   → Cookie: Cho Next.js middleware đọc
// 
// - Refresh Token: HTTP-only Cookie ONLY
//   → Backend set/manage/revoke
//   → KHÔNG accessible từ JavaScript
//   → Database tracking
// 
// SECURITY FEATURES:
// ✅ Refresh token XSS-proof (HTTP-only)
// ✅ SameSite cookies (CSRF protection)
// ✅ Short-lived access token (15 min)
// ✅ Refresh token can be revoked remotely
// ========================================

// Constants
const ACCESS_TOKEN_KEY = 'access_token';

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
 * Clear all tokens
 * 
 * Frontend: Clear access token từ localStorage + cookie
 * Backend: Clear refresh token từ HTTP-only cookie (khi call /auth/logout)
 */
export const clearTokens = (): void => {
  clearAccessToken();
  // Note: Refresh token được backend xóa qua API call
};

/**
 * Check if user has valid access token
 * 
 * Note: Không check refresh token vì nó ở HTTP-only cookie
 * (backend tự động handle via withCredentials: true)
 */
export const hasTokens = (): boolean => {
  return !!getAccessToken();
};
