"use client";

import { UIProvider } from "@/contexts/ui-context";
import AppShell from "@/components/layout/AppShell";

export default function MailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UIProvider>
      {/* AppShell sẽ chứa Sidebar và Main Content */}
      <AppShell>{children}</AppShell>
    </UIProvider>
  );
}
