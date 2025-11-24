// ========================================
// useUserQuery Hook
// ========================================
// Fetch and initialize user session
// ========================================

import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { getCurrentUser } from '@/lib/auth';
import { hasTokens, clearTokens } from '@/lib/token';

/**
 * Hook để initialize và maintain user session
 * Tự động chạy khi app mount
 * 
 * Logic:
 * 1. Check if có access token
 * 2. Nếu có, fetch user profile
 * 3. Nếu token expired, axios tự động refresh
 * 4. Nếu refresh fails, clear tokens và set unauthenticated
 */
export const useUserQuery = () => {
  const { setUser, setIsAuthenticated, setIsLoading, isLoading } = useAuth();

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check if có access token
        if (hasTokens()) {
          // Fetch user profile
          // Axios interceptor sẽ tự động refresh nếu token expired
          const userProfile = await getCurrentUser();
          
          setUser(userProfile);
          setIsAuthenticated(true);
        } else {
          // No tokens
          setUser(null);
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        
        // Token invalid hoặc refresh failed
        clearTokens();
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, [setUser, setIsAuthenticated, setIsLoading]);

  return { isLoading };
};
