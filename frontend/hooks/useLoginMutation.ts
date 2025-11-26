// ========================================
// useLoginMutation Hook
// ========================================
// Handle login logic
// ========================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { login as loginApi } from '@/lib/auth';
import { LoginCredentials } from '@/types/auth.types';

export const useLoginMutation = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser, setIsAuthenticated } = useAuth();
  const router = useRouter();

  const login = async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true);
      setError(null);

      // Call API
      const response = await loginApi(credentials);

      // Update global state
      setUser(response.user);
      setIsAuthenticated(true);

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
