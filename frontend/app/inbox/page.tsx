"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import SideBar from "@/components/layout/SideBar";
import MailBox from "@/components/ui/MailBox";
import MailContent from "@/components/ui/MailContent";
import ComposeModal from "@/components/ui/ComposeModal";
import ForwardModal from "@/components/ui/ForwardModal";
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
  
  // State for keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  
  // State for compose modal
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  
  // State for forward modal
  const [isForwardOpen, setIsForwardOpen] = useState(false);

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

  // Handler to select mail and sync focusedIndex
  const handleSelectMail = (mail: Mail) => {
    setSelectedMail(mail);
    // Update focusedIndex to match the selected mail
    const index = mails.findIndex(m => m.id === mail.id);
    if (index !== -1) {
      setFocusedIndex(index);
    }
  };

  // Handler to send email
  const handleSendEmail = async (emailData: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    isHtml: boolean;
  }) => {
    const token = typeof window !== 'undefined' ? window.__accessToken : null;
    if (!token) {
      throw new Error('Not authenticated');
    }

    const apiURL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:5000';
    const response = await fetch(`${apiURL}/emails/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      throw new Error('Failed to send email');
    }

    return await response.json();
  };

  // 4. Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'arrowup':
          e.preventDefault();
          // Navigate up in email list
          if (focusedIndex > 0) {
            const newIndex = focusedIndex - 1;
            setFocusedIndex(newIndex);
            if (mails[newIndex]) {
              setSelectedMail(mails[newIndex]);
            }
          }
          break;

        case 'arrowdown':
          e.preventDefault();
          // Navigate down in email list
          if (focusedIndex < mails.length - 1) {
            const newIndex = focusedIndex + 1;
            setFocusedIndex(newIndex);
            if (mails[newIndex]) {
              setSelectedMail(mails[newIndex]);
            }
          }
          break;

        case 'enter':
          e.preventDefault();
          // Open selected email
          if (mails[focusedIndex]) {
            setSelectedMail(mails[focusedIndex]);
          }
          break;

        case 'escape':
          e.preventDefault();
          // Close email detail view (mobile)
          setSelectedMail(null);
          break;

        case 'c':
          e.preventDefault();
          // Open compose modal
          setIsComposeOpen(true);
          break;

        case 'r':
          e.preventDefault();
          // TODO: Reply to selected email
          if (selectedMail) {
            console.log('[Keyboard] Reply (r) to:', selectedMail.id);
          }
          break;

        case 'a':
          e.preventDefault();
          // TODO: Reply all to selected email
          if (selectedMail) {
            console.log('[Keyboard] Reply All (a) to:', selectedMail.id);
          }
          break;

        case 'f':
          e.preventDefault();
          // Forward selected email
          if (selectedMail) {
            setIsForwardOpen(true);
          }
          break;

        case '#':
        case 'delete':
          e.preventDefault();
          // TODO: Delete selected email
          if (selectedMail) {
            console.log('[Keyboard] Delete (#):', selectedMail.id);
          }
          break;

        case 's':
          e.preventDefault();
          // TODO: Star/Unstar selected email
          if (selectedMail) {
            console.log('[Keyboard] Star (s):', selectedMail.id);
          }
          break;

        case 'e':
          e.preventDefault();
          // TODO: Archive selected email
          if (selectedMail) {
            console.log('[Keyboard] Archive (e):', selectedMail.id);
          }
          break;

        case 'u':
          e.preventDefault();
          // TODO: Mark as unread
          if (selectedMail) {
            console.log('[Keyboard] Mark Unread (u):', selectedMail.id);
          }
          break;

        default:
          break;
      }
    };

    // Add event listener
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mails, selectedMail, focusedIndex]);

  // 6. Loading State cho Authentication
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

  // 7. Render chính
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <SideBar
        user={user}
        isExpanded={isSidebarExpanded}
        toggleSidebar={toggleSidebar}
        onComposeClick={() => setIsComposeOpen(true)}
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
              onSelectMail={handleSelectMail}
              focusedIndex={focusedIndex}
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
            onForwardClick={() => selectedMail && setIsForwardOpen(true)}
          />
        </div>
      </main>

      {/* Compose Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onSend={handleSendEmail}
      />

      {/* Forward Modal */}
      {selectedMail && (
        <ForwardModal
          isOpen={isForwardOpen}
          onClose={() => setIsForwardOpen(false)}
          onSend={handleSendEmail}
          originalMail={selectedMail}
        />
      )}
    </div>
  );
}
