"use client";

import { useAuth } from "@/contexts/auth-context";
import ThemeSwitcher from "@/components/theme-switcher";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { isLoading } = useAuth();

  return (
    <div className="flex relative w-full min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
      {isLoading ? (
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : (
        <>
          {children}

          {/* ThemeSwitcher component to toggle light/dark themes */}
          <div className="absolute bottom-0 left-0 m-4">
            <ThemeSwitcher />
          </div>
        </>
      )}
    </div>
  );
}
