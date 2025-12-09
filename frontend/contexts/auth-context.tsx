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

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  accessToken: string | null;  // 🔒 IN-MEMORY ONLY
  setUser: (user: User | null) => void;
  setIsAuthenticated: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  setAccessToken: (token: string | null) => void;  // 🔒 IN-MEMORY ONLY
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);  // 🔒 IN-MEMORY

  // Wrapper cho setUser để tự động lưu vào localStorage (chỉ user data, không có tokens)
  const setUser = (userData: User | null) => {
    setUserState(userData);
    if (userData) {
      saveUserData(userData);
    } else {
      clearUserData();
    }
  };

  // Restore user data từ localStorage khi component mount
  // NOTE: Không restore token - token phải được refresh từ HttpOnly cookie
  useEffect(() => {
    const savedUser = getUserData();
    if (savedUser) {
      setUserState(savedUser);
      console.log('[AuthContext] Restored user data from localStorage:', savedUser.email);
      // DON'T set isAuthenticated yet - wait for useUserQuery to validate session
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
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
