// ========================================
// useUserQuery Hook
// ========================================
// Fetch and initialize user session
// ========================================

import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { getCurrentUser } from '@/lib/auth';
import { setGlobalAccessToken } from '@/lib/api';
import { clearTokens } from '@/lib/token';
import { AutoIndexService } from '@/lib/auto-index';

/**
 * Hook để initialize và maintain user session
 * Tự động chạy khi app mount
 * 
 * NEW SECURE STRATEGY:
 * - Access token: In-memory only (AuthContext + window.__accessToken)
 * - Refresh token: HttpOnly cookie only (sent automatically)
 * 
 * Logic:
 * 1. Kiểm tra có accessToken trong AuthContext không
 * 2. Nếu có: Fetch user profile
 * 3. Nếu không có: Gọi /auth/refresh (refreshToken tự động gửi qua cookie)
 * 4. Nếu refresh thành công: Lưu accessToken và fetch user profile
 * 5. Nếu refresh thất bại: Set unauthenticated
 */
export const useUserQuery = () => {
  const { setUser, setIsAuthenticated, setIsLoading, setAccessToken, accessToken, isLoading } = useAuth();

  useEffect(() => {
    const initializeAuth = async () => {
      console.log('[useUserQuery] 🔄 Initialization - Has in-memory accessToken:', !!accessToken);
      
      if (accessToken) {
        // Có accessToken in-memory → fetch user profile
        console.log('[useUserQuery] Has accessToken in-memory, fetching user profile...');
        try {
          const userProfile = await getCurrentUser();
          
          setUser(userProfile);
          setIsAuthenticated(true);
          console.log('[useUserQuery] ✅ User authenticated:', userProfile.email);
          
          // Auto-index emails for semantic search (background, non-blocking)
          AutoIndexService.autoIndex(userProfile.id, accessToken, 200).catch(err => {
            console.warn('[useUserQuery] Auto-index failed (non-critical):', err);
          });
          
          setIsLoading(false);
          return;
        } catch (fetchError: any) {
          console.error('[useUserQuery] ❌ Failed to fetch user:', fetchError?.response?.status, fetchError?.message);
          // Access token might be expired, will try refresh below
        }
      }
      
      // Only try refresh if we don't have a token AND we're still loading
      if (!accessToken && isLoading) {
        // Không có accessToken → thử refresh từ HttpOnly cookie
        console.log('[useUserQuery] No accessToken, attempting to refresh from HttpOnly cookie...');
        
        try {
          const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:5000';
          const refreshResponse = await fetch(`${backendUrl}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',  // 🔒 Send HttpOnly cookie automatically
            headers: { 'Content-Type': 'application/json' }
          });
          
          console.log('[useUserQuery] Refresh response:', refreshResponse.status);
          
          if (refreshResponse.ok) {
            const { accessToken: newAccessToken } = await refreshResponse.json();
            
            // Store new access token in-memory
            setAccessToken(newAccessToken);  // AuthContext
            setGlobalAccessToken(newAccessToken);  // window.__accessToken for axios
          
            console.log('[useUserQuery] ✅ Token refreshed from HttpOnly cookie');
            
            // Fetch user profile with new token
            const userProfile = await getCurrentUser();
            setUser(userProfile);
            setIsAuthenticated(true);
            console.log('[useUserQuery] ✅ User authenticated:', userProfile.email);
            
            // Auto-index emails for semantic search (background, non-blocking)
            AutoIndexService.autoIndex(userProfile.id, newAccessToken, 200).catch(err => {
              console.warn('[useUserQuery] Auto-index failed (non-critical):', err);
            });
          } else {
            console.log('[useUserQuery] ❌ No valid refresh token in HttpOnly cookie');
            clearTokens();
            setUser(null);
            setIsAuthenticated(false);
          }
        } catch (error) {
          console.error('[useUserQuery] ❌ Refresh error:', error);
          clearTokens();
          setUser(null);
          setIsAuthenticated(false);
        } finally {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();
    // Re-run when accessToken changes (e.g., after login)
  }, [accessToken]);

  return { isLoading };
};
