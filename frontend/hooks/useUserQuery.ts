// ========================================
// useUserQuery Hook
// ========================================
// Fetch and initialize user session
// ========================================

import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { getCurrentUser } from '@/lib/auth';
import { getAccessToken, setAccessToken, clearTokens } from '@/lib/token';

/**
 * Hook để initialize và maintain user session
 * Tự động chạy khi app mount
 * 
 * Logic:
 * 1. Kiểm tra có accessToken trong localStorage không
 * 2. Nếu có: Fetch user profile (axios sẽ tự động refresh nếu expired)
 * 3. Nếu không có accessToken: Thử refresh từ cookie
 * 4. Nếu refresh thành công: Fetch user profile
 * 5. Nếu refresh thất bại: Set unauthenticated
 */
export const useUserQuery = () => {
  const { setUser, setIsAuthenticated, setIsLoading, isLoading } = useAuth();

  useEffect(() => {
    const initializeAuth = async () => {
      const accessToken = getAccessToken();
      console.log('[useUserQuery] Initialization - Has accessToken:', !!accessToken);
      
      if (accessToken) {
        // Có accessToken → fetch user profile
        console.log('[useUserQuery] Has accessToken, fetching user profile...');
        try {
          const userProfile = await getCurrentUser();
          
          setUser(userProfile);
          setIsAuthenticated(true);
          console.log('[useUserQuery] ✅ User authenticated:', userProfile.email);
          setIsLoading(false);
          return;
        } catch (fetchError: any) {
          console.error('[useUserQuery] ❌ Failed to fetch user:', fetchError?.response?.status, fetchError?.message);
          
          // AccessToken có thể expired, thử refresh từ cookie
          console.log('[useUserQuery] Attempting to refresh token from cookie...');
          
          try {
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:5000';
            const refreshResponse = await fetch(`${backendUrl}/auth/refresh`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' }
            });
            
            if (refreshResponse.ok) {
              const { accessToken: newAccessToken } = await refreshResponse.json();
              setAccessToken(newAccessToken);
              console.log('[useUserQuery] ✅ Token refreshed, retrying...');
              
              // Retry fetch user
              const userProfile = await getCurrentUser();
              setUser(userProfile);
              setIsAuthenticated(true);
              console.log('[useUserQuery] ✅ User authenticated after refresh:', userProfile.email);
              setIsLoading(false);
              return;
            } else {
              console.log('[useUserQuery] ❌ Refresh failed:', refreshResponse.status);
            }
          } catch (refreshError) {
            console.error('[useUserQuery] ❌ Refresh error:', refreshError);
          }
          
          // Nếu tất cả đều fail → logout
          console.log('[useUserQuery] All authentication attempts failed, logging out...');
          clearTokens();
          setUser(null);
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }
      }
      
      // Không có accessToken → thử refresh từ cookie
      console.log('[useUserQuery] No accessToken, attempting to refresh from cookie...');
      
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:5000';
        const refreshResponse = await fetch(`${backendUrl}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });
        
        console.log('[useUserQuery] Refresh response:', refreshResponse.status);
        
        if (refreshResponse.ok) {
          const { accessToken: newAccessToken } = await refreshResponse.json();
          setAccessToken(newAccessToken);
          console.log('[useUserQuery] ✅ Token refreshed successfully');
          
          // Fetch user profile
          const userProfile = await getCurrentUser();
          setUser(userProfile);
          setIsAuthenticated(true);
          console.log('[useUserQuery] ✅ User authenticated:', userProfile.email);
        } else {
          console.log('[useUserQuery] ❌ No valid refresh token');
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
    };

    initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isLoading };
};
