// ========================================
// useLoginMutation Hook
// ========================================
// Handle login logic
// ========================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { login as loginApi } from '@/lib/auth';
import { setGlobalAccessToken } from '@/lib/api';
import { LoginCredentials } from '@/types/auth.types';

export const useLoginMutation = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser, setIsAuthenticated, setAccessToken } = useAuth();
  const router = useRouter();

  const login = async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true);
      setError(null);

      // Call API (refreshToken automatically set as HttpOnly cookie by backend)
      const response = await loginApi(credentials);

      // Update global state with IN-MEMORY access token
      setUser(response.user);
      setIsAuthenticated(true);
      setAccessToken(response.accessToken);  // 🔒 Store in AuthContext
      setGlobalAccessToken(response.accessToken);  // 🔒 Store in window (for axios interceptor)

      console.log('[useLoginMutation] ✅ Login successful, access token stored in-memory');

      // Redirect
      router.push('/inbox');

      return response;
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Login failed';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    login,
    isLoading,
    error,
  };
};
