"use client"

import { useAuth } from "@/contexts/auth-context";
import LogoutButton from "@/components/logout-button";
import ThemeSwitcher from "@/components/theme-switcher";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Inbox() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans dark:bg-zinc-900">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">Email Customize</h1>
            {user && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Welcome, {user.email}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-20 px-6">
        <div className="max-w-7xl mx-auto py-8">
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-2">Welcome to your Inbox</h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              This is a placeholder for the email dashboard.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}