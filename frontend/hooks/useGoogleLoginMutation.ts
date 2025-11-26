// ========================================
// useGoogleLoginMutation Hook
// ========================================
// Handle Google OAuth login logic
// ========================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { loginWithGoogle as loginWithGoogleApi } from '@/lib/auth';

export const useGoogleLoginMutation = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser, setIsAuthenticated } = useAuth();
  const router = useRouter();

  const loginWithGoogle = async (credentialToken: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // Call API with Google credential
      const response = await loginWithGoogleApi(credentialToken);

      // Update global state
      setUser(response.user);
      setIsAuthenticated(true);

      // Redirect to inbox
      router.push('/inbox');

      return response;
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Google login failed';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    loginWithGoogle,
    isLoading,
    error,
  };
};
