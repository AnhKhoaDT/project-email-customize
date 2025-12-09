"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import SideBar from "@/components/layout/SideBar";
import MailBox from "@/components/ui/MailBox";
import MailContent from "@/components/ui/MailContent";
import ComposeModal from "@/components/ui/ComposeModal";
import ForwardModal from "@/components/ui/ForwardModal";
import Kanban from "@/components/ui/Kanban";
import { type Mail } from "@/types";
import { type EmailData } from "@/types";
// import { mockMails } from "@/mockDatas/index"; // Xoá hoặc comment dòng này

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth();

  const [isKanBanMode, setIsKanBanMode] = useState(false);

  // State quản lý UI
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);

  // State quản lý dữ liệu Mail
  const [mails, setMails] = useState<Mail[]>([]);

  // state quản lí dữ liệu kanban
  const [inProgressMails, setInProgressMails] = useState<Mail[]>([]);
  const [doneMails, setDoneMails] = useState<Mail[]>([]);

  const [selectedMail, setSelectedMail] = useState<EmailData | null>(null);
  const [isMailsLoading, setIsMailsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // State for keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  // State for compose modal
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  // State for forward modal
  const [isForwardOpen, setIsForwardOpen] = useState(false);

  // Counter to trigger reply mode (increment to trigger)
  const [replyTrigger, setReplyTrigger] = useState(0);

  // 1. Client-side authentication check
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      console.log("[Inbox] User not authenticated, redirecting to login...");
      router.push("/login");
    }
  }, [isAuthenticated, isAuthLoading, router]);

  // 2. Call API lấy danh sách mail (initial load)
  useEffect(() => {
    // Chỉ gọi API khi đã xác thực user thành công
    if (isAuthenticated) {
      const fetchMails = async () => {
        try {
          setIsMailsLoading(true);
          setError(null);

          const id = "INBOX";
          const limit = 20; // Reduced for better infinite scroll UX

          // 🔒 Get access token from window (in-memory storage)
          const token =
            typeof window !== "undefined" ? window.__accessToken : null;

          if (!token) {
            console.log(
              "[Inbox] No access token available yet, skipping fetch"
            );
            setIsMailsLoading(false);
            return;
          }

          const maiURL =
            process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
          const response = await fetch(
            `${maiURL}/mailboxes/${id}/emails?limit=${limit}`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              credentials: "include",
            }
          );

          if (!response.ok) {
            throw new Error("Failed to fetch mails");
          }

          const data = await response.json();
          console.log("Fetched mails:", data);

          const fetched = Array.isArray(data?.messages)
            ? data.messages
            : Array.isArray(data)
            ? data
            : [];

          setMails(fetched);
          setNextPageToken(data.nextPageToken || null);
          setHasMore(!!data.nextPageToken);
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

  // Function to load more emails (infinite scroll)
  const loadMoreMails = async () => {
    if (!hasMore || isLoadingMore || !nextPageToken) return;

    try {
      setIsLoadingMore(true);

      const token = typeof window !== "undefined" ? window.__accessToken : null;
      if (!token) return;

      const maiURL =
        process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
      const response = await fetch(
        `${maiURL}/mailboxes/INBOX/emails?limit=20&pageToken=${nextPageToken}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (!response.ok) throw new Error("Failed to load more mails");

      const data = await response.json();
      console.log("Loaded more mails:", data);

      const newMails = Array.isArray(data?.messages) ? data.messages : [];

      // Append new emails to existing list, filter out duplicates by ID
      setMails((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const uniqueNewMails = newMails.filter(
          (m: Mail) => !existingIds.has(m.id)
        );
        return [...prev, ...uniqueNewMails];
      });
      setNextPageToken(data.nextPageToken || null);
      setHasMore(!!data.nextPageToken);
    } catch (err: any) {
      console.error("Error loading more mails:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // 3. Infinite Scroll Handler
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains("mailbox-scroll-container")) return;

      const { scrollTop, scrollHeight, clientHeight } = target;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

      // Load more when scrolled 80% down
      if (scrollPercentage > 0.8 && hasMore && !isLoadingMore) {
        loadMoreMails();
      }
    };

    // Add scroll listener to mailbox container
    const mailboxContainer = document.querySelector(
      ".mailbox-scroll-container"
    );
    if (mailboxContainer) {
      mailboxContainer.addEventListener("scroll", handleScroll);
      return () => mailboxContainer.removeEventListener("scroll", handleScroll);
    }
  }, [hasMore, isLoadingMore, nextPageToken]);

  // 4. Logic Auto select trên Desktop
  useEffect(() => {
    const isDesktop = window.innerWidth >= 768;

    // Nếu là desktop, đã load xong mail, có mail, và chưa chọn mail nào
    if (
      isDesktop &&
      !isMailsLoading &&
      Array.isArray(mails) &&
      mails.length > 0 &&
      !selectedMail
    ) {
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
    // fetch email
    const id = mail.id;
    const fetchMailDetail = async () => {
      try {
        const token =
          typeof window !== "undefined" ? window.__accessToken : null;
        if (!token) return;
        const maiURL =
          process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
        const response = await fetch(`${maiURL}/emails/${id}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        });
        if (!response.ok) throw new Error("Failed to fetch mail detail");
        const data = await response.json();
        console.log("Fetched mail detail:", data);
        setSelectedMail(data);
      } catch (err: any) {
        console.error("Error fetching mail detail:", err);
      }
    };

    // Đã thêm dòng này để thực thi hàm
    fetchMailDetail();
  }; // Đã thêm dấu đóng ngoặc này

  // Handler to send email
  const handleSendEmail = async (emailData: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    isHtml: boolean;
  }) => {
    const token = typeof window !== "undefined" ? window.__accessToken : null;
    if (!token) {
      throw new Error("Not authenticated");
    }

    const apiURL =
      process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
    const response = await fetch(`${apiURL}/emails/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      throw new Error("Failed to send email");
    }

    return await response.json();
  };

  // // 5. Keyboard Navigation
  // useEffect(() => {
  //   const handleKeyDown = (e: KeyboardEvent) => {
  //     // Don't trigger if user is typing in an input/textarea
  //     if (
  //       e.target instanceof HTMLInputElement ||
  //       e.target instanceof HTMLTextAreaElement
  //     ) {
  //       return;
  //     }

  //     switch (e.key.toLowerCase()) {
  //       case "arrowup":
  //         e.preventDefault();
  //         // Navigate up in email list
  //         if (focusedIndex > 0) {
  //           const newIndex = focusedIndex - 1;
  //           setFocusedIndex(newIndex);
  //           if (mails[newIndex]) {
  //             setSelectedMail(mails[newIndex]);
  //           }
  //         }
  //         break;

  //       case "arrowdown":
  //         e.preventDefault();
  //         // Navigate down in email list
  //         if (focusedIndex < mails.length - 1) {
  //           const newIndex = focusedIndex + 1;
  //           setFocusedIndex(newIndex);
  //           if (mails[newIndex]) {
  //             setSelectedMail(mails[newIndex]);
  //           }
  //         }
  //         break;

  //       case "enter":
  //         e.preventDefault();
  //         // Open selected email
  //         if (mails[focusedIndex]) {
  //           setSelectedMail(mails[focusedIndex]);
  //         }
  //         break;

  //       case "escape":
  //         e.preventDefault();
  //         // Close email detail view (mobile)
  //         setSelectedMail(null);
  //         break;

  //       case "c":
  //         e.preventDefault();
  //         // Open compose modal
  //         setIsComposeOpen(true);
  //         break;

  //       case "r":
  //         e.preventDefault();
  //         // Reply to selected email
  //         if (selectedMail) {
  //           setReplyTrigger((prev) => prev + 1);
  //         }
  //         break;

  //       case "a":
  //         e.preventDefault();
  //         // TODO: Reply all to selected email
  //         if (selectedMail) {
  //           console.log("[Keyboard] Reply All (a) to:", selectedMail.id);
  //         }
  //         break;

  //       case "f":
  //         e.preventDefault();
  //         // Forward selected email
  //         if (selectedMail) {
  //           setIsForwardOpen(true);
  //         }
  //         break;

  //       case "#":
  //       case "delete":
  //         e.preventDefault();
  //         // TODO: Delete selected email
  //         if (selectedMail) {
  //           console.log("[Keyboard] Delete (#):", selectedMail.id);
  //         }
  //         break;

  //       case "s":
  //         e.preventDefault();
  //         // TODO: Star/Unstar selected email
  //         if (selectedMail) {
  //           console.log("[Keyboard] Star (s):", selectedMail.id);
  //         }
  //         break;

  //       case "e":
  //         e.preventDefault();
  //         // TODO: Archive selected email
  //         if (selectedMail) {
  //           console.log("[Keyboard] Archive (e):", selectedMail.id);
  //         }
  //         break;

  //       case "u":
  //         e.preventDefault();
  //         // TODO: Mark as unread
  //         if (selectedMail) {
  //           console.log("[Keyboard] Mark Unread (u):", selectedMail.id);
  //         }
  //         break;

  //       default:
  //         break;
  //     }
  //   };

  //   // Add event listener
  //   window.addEventListener("keydown", handleKeyDown);

  //   // Cleanup
  //   return () => {
  //     window.removeEventListener("keydown", handleKeyDown);
  //   };
  // }, [mails, selectedMail, focusedIndex]);

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
              isLoadingMore={isLoadingMore}
              hasMore={hasMore}
              kanbanMode={isKanBanMode}
              kanbanClick={() => setIsKanBanMode((prev) => !prev)}
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
          {isKanBanMode ? (
            <Kanban />
          ) : (
            <MailContent
              mail={selectedMail}
              onBack={() => setSelectedMail(null)}
              onForwardClick={() => selectedMail && setIsForwardOpen(true)}
              onReplyClick={() => setReplyTrigger((prev) => prev + 1)}
              triggerReply={replyTrigger}
            />
          )}
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
