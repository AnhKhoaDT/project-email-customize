"use client";

// ========================================
// Auth Initializer Component
// ========================================
// Component này chịu trách nhiệm initialize auth state
// Chạy useUserQuery hook để fetch user khi app mount
// ========================================

import { useUserQuery } from '@/hooks/useUserQuery';
import { ReactNode } from 'react';

export const AuthInitializer: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isLoading } = useUserQuery();

  // Show loading state while initializing auth
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
