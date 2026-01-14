/**
 * Get access token from AuthContext or window fallback
 * This ensures consistent token retrieval across the app
 * 
 * IMPORTANT: Always pass accessToken from useAuth() when available
 */
export const getAccessToken = (contextToken?: string | null): string | null => {
  // Priority 1: Token from AuthContext (most reliable)
  if (contextToken) {
    return contextToken;
  }
  
  // Priority 2: Token from window (fallback for components not using context)
  if (typeof window !== 'undefined' && window.__accessToken) {
    return window.__accessToken;
  }
  
  return null;
};
