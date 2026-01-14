"use client";

import { useAuth } from "@/contexts/auth-context";
import { useUI } from "@/contexts/ui-context";
import { useToast } from "@/contexts/toast-context";
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
  const { showToast } = useToast();

  const router = useRouter();

  // Bảo vệ route: Nếu chưa login, đá về trang login
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSendEmail = async (emailData: any) => {
    try {
      const token =
        typeof window !== "undefined" ? (window as any).__accessToken : null;
      if (!token) throw new Error("Not authenticated");
      const apiURL =
        process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
      const response = await fetch(`${apiURL}/emails/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(emailData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send email');
      }
    } catch (error: any) {
      console.error('Send email error:', error);
      throw error; // Re-throw to let ComposeModal handle it
    }
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
