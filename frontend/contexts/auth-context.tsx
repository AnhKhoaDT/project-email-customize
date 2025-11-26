"use client";

// ========================================
// AUTH CONTEXT - STATE ONLY
// ========================================
// Chỉ chứa authentication state, KHÔNG chứa business logic
// Business logic nằm ở custom hooks (hooks/useLogin, useLogout, etc.)
// ========================================

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '@/types/auth.types';
import { getUserData, saveUserData, clearUserData } from '@/lib/token';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setIsAuthenticated: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Wrapper cho setUser để tự động lưu vào localStorage
  const setUser = (userData: User | null) => {
    setUserState(userData);
    if (userData) {
      saveUserData(userData);
    } else {
      clearUserData();
    }
  };

  // Restore user từ localStorage khi component mount
  useEffect(() => {
    const savedUser = getUserData();
    if (savedUser) {
      setUserState(savedUser);
      setIsAuthenticated(true);
      console.log('[AuthContext] Restored user from localStorage:', savedUser.email);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        setUser,
        setIsAuthenticated,
        setIsLoading,
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
