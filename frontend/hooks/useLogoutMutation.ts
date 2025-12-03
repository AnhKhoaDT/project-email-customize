// ========================================
// useLogoutMutation Hook
// ========================================
// Handle logout logic
// ========================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { logout as logoutApi } from '@/lib/auth';

export const useLogoutMutation = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { setUser, setIsAuthenticated, setAccessToken } = useAuth();
  const router = useRouter();

  const logout = async () => {
    try {
      setIsLoading(true);

      // Call API to logout (clears HttpOnly cookie)
      await logoutApi();
    } catch (error) {
      console.error('Logout error:', error);
      // Continue with logout even if API fails
    } finally {
      // Clear global state (in-memory access token)
      setUser(null);
      setIsAuthenticated(false);
      setAccessToken(null);  // 🔒 Clear AuthContext
      setIsLoading(false);
      
      // Clear window.__accessToken
      if (typeof window !== 'undefined') {
        window.__accessToken = null;
      }

      console.log('[useLogoutMutation] ✅ Logged out, access token cleared from memory');

      // Redirect to login
      router.push('/login');
    }
  };

  return {
    logout,
    isLoading,
  };
};
