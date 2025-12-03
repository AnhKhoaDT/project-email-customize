"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import SideBar from "@/components/layout/SideBar";
import MailBox from "@/components/ui/MailBox";
import MailContent from "@/components/ui/MailContent";
import { type Mail } from "@/types";
// import { mockMails } from "@/mockDatas/index"; // Xoá hoặc comment dòng này

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth();

  // State quản lý UI
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);

  // State quản lý dữ liệu Mail
  const [mails, setMails] = useState<Mail[]>([]);
  const [selectedMail, setSelectedMail] = useState<Mail | null>(null);
  const [isMailsLoading, setIsMailsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Client-side authentication check
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      console.log("[Inbox] User not authenticated, redirecting to login...");
      router.push("/login");
    }
  }, [isAuthenticated, isAuthLoading, router]);

  // 2. Call API lấy danh sách mail
  useEffect(() => {
    // Chỉ gọi API khi đã xác thực user thành công
    if (isAuthenticated) {
      const fetchMails = async () => {
        try {
          setIsMailsLoading(true);
          setError(null);

          // Thay '/api/mails' bằng endpoint thực tế của bạn
          // Ví dụ: const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/emails`);
          const id = "INBOX"; // Hoặc lấy từ nơi khác nếu cần
          const limit = 50;
          const page = 1;
          const pageToken = ""; // Nếu có token phân trang, hãy thay thế ở đây
          
          // 🔒 Get access token from window (in-memory storage)
          const token = typeof window !== 'undefined' ? window.__accessToken : null;
          
          if (!token) {
            console.log('[Inbox] No access token available yet, skipping fetch');
            setIsMailsLoading(false);
            return;
          }
          
          const maiURL =
            process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
          const response = await fetch(
            `${maiURL}/mailboxes/${id}/emails?page=${page}&limit=${limit}&pageToken=${pageToken}`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              credentials: 'include',  // 🔒 Send HttpOnly cookie for refresh token
            }
          );

          if (!response.ok) {
            throw new Error("Failed to fetch mails");
          }

          const data = await response.json();
          console.log("Fetched mails:", data);
          // Giả sử API trả về mảng mail trong `messages` hoặc trả về mảng trực tiếp
          // Bảo đảm luôn set một mảng mặc định để tránh `undefined`
          const fetched = Array.isArray(data?.messages)
            ? data.messages
            : Array.isArray(data)
            ? data
            : [];
          setMails(fetched);
        } catch (err: any) {
          console.error("Error fetching mails:", err);
          setError(err.message || "Something went wrong");
        } finally {
          setIsMailsLoading(false);
        }
      };

      fetchMails();
    }
  }, [isAuthenticated]);

  // 3. Logic Auto select trên Desktop
  useEffect(() => {
    const isDesktop = window.innerWidth >= 768;

    // Nếu là desktop, đã load xong mail, có mail, và chưa chọn mail nào
    if (isDesktop && !isMailsLoading && Array.isArray(mails) && mails.length > 0 && !selectedMail) {
      // Logic cũ của bạn là setSelectedMail(null) -> có thể bạn muốn giữ trạng thái trống
      // Tuy nhiên, UX tốt thường sẽ auto-select mail đầu tiên:
      // setSelectedMail(mails[0]);

      // Giữ nguyên logic của bạn (không chọn gì cả hoặc reset):
      setSelectedMail(null);
    }
  }, [mails, selectedMail, isMailsLoading]);

  const toggleSidebar = () => {
    setIsSidebarExpanded((prev) => !prev);
  };

  // 4. Loading State cho Authentication
  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">
            Checking authentication...
          </p>
        </div>
      </div>
    );
  }

  // Nếu chưa auth thì return null (đợi redirect)
  if (!isAuthenticated) {
    return null;
  }

  // 5. Render chính
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <SideBar
        user={user}
        isExpanded={isSidebarExpanded}
        toggleSidebar={toggleSidebar}
      />

      <main className="flex flex-1 h-full w-full relative">
        {/* Cột Danh sách Mail */}
        <div
          className={`
            h-full 
            ${selectedMail ? "hidden" : "flex"} 
            md:flex md:w-1/3 w-full
          `}
        >
          {isMailsLoading ? (
            // Loading state riêng cho cột danh sách mail
            <div className="flex items-center justify-center w-full h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : error ? (
            // Error state
            <div className="flex items-center justify-center w-full h-full text-red-500">
              {error}
            </div>
          ) : (
            <MailBox
              toggleSidebar={toggleSidebar}
              mails={mails}
              selectedMail={selectedMail}
              onSelectMail={setSelectedMail}
            />
          )}
        </div>

        {/* Cột Nội dung Mail */}
        <div
          className={`
            h-full 
            ${selectedMail ? "flex" : "hidden"} 
            md:flex md:w-2/3 w-full
          `}
        >
          <MailContent
            mail={selectedMail}
            onBack={() => setSelectedMail(null)}
          />
        </div>
      </main>
    </div>
  );
}
