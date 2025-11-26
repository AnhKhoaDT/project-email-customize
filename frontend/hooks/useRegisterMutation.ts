// ========================================
// useRegisterMutation Hook
// ========================================
// Handle user registration
// ========================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { register as registerApi } from '@/lib/auth';
import { RegisterCredentials } from '@/types/auth.types';

export const useRegisterMutation = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const register = async (credentials: RegisterCredentials) => {
    try {
      setIsLoading(true);
      setError(null);
      setSuccess(false);

      // Call API
      const user = await registerApi(credentials);

      setSuccess(true);

      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/login');
      }, 2000);

      return user;
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Registration failed';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    register,
    isLoading,
    error,
    success,
  };
};
