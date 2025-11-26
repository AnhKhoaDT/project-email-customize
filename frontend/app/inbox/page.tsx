"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import SideBar from "@/components/layout/SideBar";
import MailBox from "@/components/ui/MailBox";
import MailContent from "@/components/ui/MailContent";
import { type Mail } from "@/types";
import { mockMails } from "@/mockDatas/index";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [selectedMail, setSelectedMail] = useState<Mail | null>(null);

  // Client-side authentication check
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      console.log('[Inbox] User not authenticated, redirecting to login...');
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const toggleSidebar = () => {
    setIsSidebarExpanded((prev) => !prev);
  };

  const fetchMailBox = () => {
    return mockMails;
  };
  const mails = fetchMailBox();

  // Tùy chọn: Auto select trên desktop, nhưng trên mobile thì không nên auto select ngay
  // để người dùng thấy danh sách trước.
  useEffect(() => {
    const isDesktop = window.innerWidth >= 768; // logic đơn giản check màn hình
    if (isDesktop && mails && mails.length > 0 && !selectedMail) {
      setSelectedMail(mails[0]);
    }
  }, [mails, selectedMail]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show nothing (will redirect via useEffect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <SideBar
        user={user}
        isExpanded={isSidebarExpanded}
        toggleSidebar={toggleSidebar}
      />

      <main className="flex flex-1 h-full w-full relative">
        {/* LOGIC RESPONSIVE:
            1. MailBox (Danh sách):
               - Mobile: Ẩn khi đã chọn mail (hidden), hiện khi chưa chọn (flex).
               - Desktop (md): Luôn hiện (md:flex) và chiếm 1/3 chiều rộng (md:w-1/3).
        */}
        <div
          className={`
            h-full 
            ${selectedMail ? "hidden" : "flex"} 
            md:flex md:w-1/3 w-full
          `}
        >
          <MailBox
            toggleSidebar={toggleSidebar}
            mails={mails}
            selectedMail={selectedMail}
            onSelectMail={setSelectedMail}
          />
        </div>

        {/* LOGIC RESPONSIVE:
            2. MailContent (Nội dung):
               - Mobile: Hiện khi đã chọn mail (flex), ẩn khi chưa chọn (hidden).
               - Desktop (md): Luôn hiện (md:flex) và chiếm 2/3 chiều rộng (md:w-2/3).
        */}
        <div
          className={`
            h-full 
            ${selectedMail ? "flex" : "hidden"} 
            md:flex md:w-2/3 w-full
          `}
        >
          <MailContent
            mail={selectedMail}
            // Khi bấm nút Back (trên mobile), reset state để quay về danh sách
            onBack={() => setSelectedMail(null)}
          />
        </div>
      </main>
    </div>
  );
}