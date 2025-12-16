"use client";

import { useAuth } from "@/contexts/auth-context";
import { useUI } from "@/contexts/ui-context";
import SideBar from "@/components/layout/SideBar";
import ComposeModal from "@/components/ui/ComposeModal";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const {
    isSidebarExpanded,
    toggleSidebar,
    isKanBanMode,
    toggleKanBanMode,
    isComposeOpen,
    setComposeOpen,
  } = useUI();

  const router = useRouter();

  // Bảo vệ route: Nếu chưa login, đá về trang login
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSendEmail = async (emailData: any) => {
    // (Giữ nguyên logic gửi email của bạn)
    const token =
      typeof window !== "undefined" ? (window as any).__accessToken : null;
    if (!token) throw new Error("Not authenticated");
    const apiURL =
      process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
    await fetch(`${apiURL}/emails/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(emailData),
    });
  };

  if (!isAuthenticated) return null; // Hoặc return loading skeleton

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <SideBar
        user={user}
        isExpanded={isSidebarExpanded}
        toggleSidebar={toggleSidebar}
        onComposeClick={() => setComposeOpen(true)}
        isKanbanMode={isKanBanMode}
        kanbanClick={toggleKanBanMode}
      />

      <main className="flex-1 h-full w-full relative overflow-hidden">
        {children}
      </main>

      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setComposeOpen(false)}
        onSend={handleSendEmail}
      />
    </div>
  );
}
