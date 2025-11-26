"use client"

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { setAccessToken } from '@/lib/token';

export default function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser, setIsAuthenticated } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const authStatus = searchParams.get('auth');
      
      if (authStatus === 'success') {
        try {
          const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:5000';
          
          // Call /auth/refresh to get accessToken (refreshToken is in HttpOnly cookie)
          const refreshResponse = await fetch(`${backendUrl}/auth/refresh`, {
            method: 'POST',
            credentials: 'include', // Send cookies
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          if (!refreshResponse.ok) {
            throw new Error('Failed to refresh token');
          }
          
          const { accessToken } = await refreshResponse.json();
          
          // Store accessToken
          setAccessToken(accessToken);
          
          // Fetch user info
          const userResponse = await fetch(`${backendUrl}/users/me`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            },
            credentials: 'include'
          });
          
          if (userResponse.ok) {
            const userData = await userResponse.json();
            const userObj = userData.user || userData;
            
            // Set user and authenticated state
            setUser(userObj);
            setIsAuthenticated(true);
            
            console.log('Callback - User authenticated:', userObj);
            router.push('/inbox');
          } else {
            setError('Failed to fetch user information');
          }
        } catch (err) {
          console.error('Callback error:', err);
          setError('Authentication failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
      } else if (authStatus === 'error') {
        setError(searchParams.get('message') || 'Authentication failed');
      } else {
        setError('Invalid callback - missing auth status');
      }
    };

    handleCallback();
  }, [searchParams, router, setUser]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Authentication Error</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-4">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-zinc-600 dark:text-zinc-400">Completing authentication...</p>
      </div>
    </div>
  );
}
