// ========================================
// useGoogleLoginMutation Hook
// ========================================
// Handle Google OAuth login logic
// ========================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { loginWithGoogle as loginWithGoogleApi } from '@/lib/auth';
import { setGlobalAccessToken } from '@/lib/api';

export const useGoogleLoginMutation = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser, setIsAuthenticated, setAccessToken } = useAuth();
  const router = useRouter();

  const loginWithGoogle = async (credentialToken: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // Call API with Google credential (refreshToken set as HttpOnly cookie by backend)
      const response = await loginWithGoogleApi(credentialToken);

      // Update global state with IN-MEMORY access token
      setUser(response.user);
      setIsAuthenticated(true);
      setAccessToken(response.accessToken);  // 🔒 Store in AuthContext
      setGlobalAccessToken(response.accessToken);  // 🔒 Store in window (for axios interceptor)

      console.log('[useGoogleLoginMutation] ✅ Google login successful, access token stored in-memory');

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
