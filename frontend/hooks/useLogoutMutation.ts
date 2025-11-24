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
  const { setUser, setIsAuthenticated } = useAuth();
  const router = useRouter();

  const logout = async () => {
    try {
      setIsLoading(true);

      // Call API to logout (clears HTTP-only cookie)
      await logoutApi();
    } catch (error) {
      console.error('Logout error:', error);
      // Continue with logout even if API fails
    } finally {
      // Clear global state
      setUser(null);
      setIsAuthenticated(false);
      setIsLoading(false);

      // Redirect to login
      router.push('/login');
    }
  };

  return {
    logout,
    isLoading,
  };
};
