"use client";

// ========================================
// AUTH CONTEXT - IN-MEMORY TOKEN STORAGE
// ========================================
// SECURITY STRATEGY:
// - Access Token: In-memory ONLY (not persisted)
// - Refresh Token: HttpOnly cookie ONLY (server-side)
// - User data: localStorage (for UX only, not sensitive)
// 
// Benefits:
// ✅ Access token immune to XSS (not in localStorage/cookies)
// ✅ Refresh token immune to XSS (HttpOnly cookie)
// ✅ CSRF protection via SameSite cookie attribute
// ========================================

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '@/types/auth.types';
import { getUserData, saveUserData, clearUserData } from '@/lib/token';

// Decode JWT to get expiration time
const decodeJWT = (token: string): { exp?: number } | null => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('[AuthContext] Failed to decode JWT:', error);
    return null;
  }
};

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAuthInitialized: boolean;  // 🔒 New: tracks if auth check is complete
  accessToken: string | null;  // 🔒 IN-MEMORY ONLY
  setUser: (user: User | null) => void;
  setIsAuthenticated: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  setAccessToken: (token: string | null) => void;  // 🔒 IN-MEMORY ONLY
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticatedState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);  // 🔒 New flag
  const [accessToken, setAccessToken] = useState<string | null>(null);  // 🔒 IN-MEMORY

  // Wrapper for setIsAuthenticated to persist state
  const setIsAuthenticated = (value: boolean) => {
    setIsAuthenticatedState(value);
    if (typeof window !== 'undefined') {
      if (value) {
        localStorage.setItem('isAuthenticated', 'true');
      } else {
        localStorage.removeItem('isAuthenticated');
      }
    }
  };

  // Wrapper cho setUser để tự động lưu vào localStorage (chỉ user data, không có tokens)
  const setUser = (userData: User | null) => {
    setUserState(userData);
    if (userData) {
      saveUserData(userData);
    } else {
      clearUserData();
    }
  };

  // Restore user data AND auth state từ localStorage khi component mount
  // NOTE: Không restore token - token phải được refresh từ HttpOnly cookie
  useEffect(() => {
    const savedUser = getUserData();
    const savedAuthState = localStorage.getItem('isAuthenticated') === 'true';
    
    if (savedUser && savedAuthState) {
      setUserState(savedUser);
      setIsAuthenticatedState(true);
      console.log('[AuthContext] Restored user data from localStorage:', savedUser.email);
      // Auth state restored - useUserQuery will validate and refresh token if needed
    }
  }, []);

  // Listen for token refresh events from api.ts interceptor
  useEffect(() => {
    const handleTokenRefresh = (event: CustomEvent) => {
      const { accessToken: newToken } = event.detail;
      console.log('[AuthContext] Token refreshed by interceptor, updating context');
      setAccessToken(newToken);
    };

    window.addEventListener('tokenRefreshed', handleTokenRefresh as EventListener);
    
    return () => {
      window.removeEventListener('tokenRefreshed', handleTokenRefresh as EventListener);
    };
  }, []);

  // Sync window.__accessToken whenever AuthContext accessToken changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__accessToken = accessToken;
      console.log('[AuthContext] Synced window.__accessToken:', !!accessToken);
    }
  }, [accessToken]);

  // Set isAuthInitialized when loading completes
  useEffect(() => {
    if (!isLoading && !isAuthInitialized) {
      setIsAuthInitialized(true);
      console.log('[AuthContext] Auth initialization complete');
    }
  }, [isLoading, isAuthInitialized]);

  // Auto-refresh token based on JWT expiration
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    // Decode JWT to get expiration time
    const decoded = decodeJWT(accessToken);
    if (!decoded || !decoded.exp) {
      console.warn('[AuthContext] Cannot decode JWT or missing exp claim');
      return;
    }

    const expiresAt = decoded.exp * 1000; // Convert to milliseconds
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    
    // Refresh 1 minute before expiration (or immediately if already expired)
    const refreshBuffer = 60 * 1000; // 1 minute
    const refreshIn = Math.max(0, timeUntilExpiry - refreshBuffer);

    console.log('[AuthContext] Token expires in:', Math.round(timeUntilExpiry / 1000), 'seconds');
    console.log('[AuthContext] Will refresh in:', Math.round(refreshIn / 1000), 'seconds');

    const refreshTimeout = setTimeout(async () => {
      console.log('[AuthContext] Auto-refreshing token before expiration...');
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:5000';
        const response = await fetch(`${backendUrl}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
          const { accessToken: newToken } = await response.json();
          setAccessToken(newToken);
          if (typeof window !== 'undefined') {
            window.__accessToken = newToken;
          }
          console.log('[AuthContext] ✅ Token auto-refreshed successfully');
        } else {
          console.warn('[AuthContext] ⚠️ Auto-refresh failed, user may need to re-login');
          // Optionally logout user
          setIsAuthenticated(false);
          setAccessToken(null);
          setUser(null);
        }
      } catch (error) {
        console.error('[AuthContext] ❌ Auto-refresh error:', error);
      }
    }, refreshIn);

    return () => {
      console.log('[AuthContext] Clearing auto token refresh timeout');
      clearTimeout(refreshTimeout);
    };
  }, [isAuthenticated, accessToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        isAuthInitialized,
        accessToken,
        setUser,
        setIsAuthenticated,
        setIsLoading,
        setAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// ========================================
// useAuth Hook
// ========================================
// Access auth state từ bất kỳ component nào

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
