"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useUI } from "@/contexts/ui-context"; // Import useUI
import { useToast } from "@/contexts/toast-context";
import MailBox from "@/components/ui/MailBox";
import MailContent from "@/components/ui/MailContent";
import ForwardModal from "@/components/ui/ForwardModal";
import Kanban from "@/components/ui/Kanban";
import { type SearchMode } from "@/components/search/SearchModeDropdown";
import { type Mail, type EmailData } from "@/types";
import { useSearch } from "@/hooks/useSearch";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading, isAuthInitialized, accessToken } = useAuth();
  const { showToast } = useToast();

  // Lấy state từ Global UI Context thay vì state cục bộ
  const { isKanBanMode, toggleKanBanMode, toggleSidebar } = useUI();

  // State quản lý dữ liệu Mail
  const [mails, setMails] = useState<Mail[]>([]);
  const [selectedMail, setSelectedMail] = useState<EmailData | null>(null);
  const [isMailsLoading, setIsMailsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state - now from hook
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("q");
  const [isSearching, setIsSearching] = useState(false);

  // Pagination state
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // State for keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  // State for forward modal
  const [isForwardOpen, setIsForwardOpen] = useState(false);

  // Counter to trigger reply mode
  const [replyTrigger, setReplyTrigger] = useState(0);

  // Fetch inbox mails function (reusable) - Define BEFORE useSearch
  const fetchInboxMails = useCallback(async () => {
    console.log('[Inbox] fetchInboxMails called');
    setError(null); // Clear any previous errors
    try {
      setIsMailsLoading(true);
      const id = "INBOX";
      const limit = 20;

      // Use token from AuthContext instead of window.__accessToken
      const token = accessToken || (typeof window !== "undefined" ? window.__accessToken : null);
      console.log('[Inbox] Token check:', { hasToken: !!token, source: accessToken ? 'AuthContext' : 'window' });
      if (!token) {
        console.log('[Inbox] No token found, aborting fetch');
        setIsMailsLoading(false);
        return;
      }

      const maiURL =
        process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
      console.log('[Inbox] Fetching from:', `${maiURL}/mailboxes/${id}/emails?limit=${limit}`);
      const response = await fetch(
        `${maiURL}/mailboxes/${id}/emails?limit=${limit}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      console.log('[Inbox] Response status:', response.status);
      if (!response.ok) throw new Error("Failed to fetch mails");

      const data = await response.json();
      const fetched = Array.isArray(data?.messages)
        ? data.messages
        : Array.isArray(data)
        ? data
        : [];

      console.log('[Inbox] Fetched mails:', fetched.length);
      setMails(fetched);
      setNextPageToken(data.nextPageToken || null);
      setHasMore(!!data.nextPageToken);
    } catch (err: any) {
      console.error('[Inbox] Fetch error:', err);
      setError("Unable to load emails. Please try again.");
    } finally {
      setIsMailsLoading(false);
    }
  }, [accessToken]);

  // Use search hook
  const {
    searchMode,
    setSearchMode,
    isSearching: hookIsSearching,
    error: searchError,
    handleSearch,
    onClearSearch,
  } = useSearch({
    folderSlug: "inbox",
    isAuthenticated,
    isAuthInitialized,
    accessToken,
    onMailsChange: (mails) => {
      setMails(mails);
      setIsMailsLoading(false); // Stop loading when search results arrive
    },
    onErrorChange: setError,
    onLoadingChange: setIsSearching,
    onRefreshMails: fetchInboxMails,
  });

  // Update error from search
  useEffect(() => {
    if (searchError) {
      setError(searchError);
    }
  }, [searchError]);

  // 1. Client-side authentication check
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isAuthLoading, router]);

  // 2. Call API lấy danh sách mail on mount (and after clear search)
  useEffect(() => {
    console.log('[Inbox] fetchInboxMails effect:', { isAuthenticated, searchQuery, isAuthLoading });
    if (isAuthenticated && !searchQuery) {
      // Clear error when returning to inbox
      setError(null);
      fetchInboxMails();
    }
  }, [isAuthenticated, searchQuery, fetchInboxMails, isAuthLoading]);

  // Load more function ... (Giữ nguyên logic cũ của bạn)
  const loadMoreMails = async () => {
    if (!hasMore || isLoadingMore || !nextPageToken) return;
    // ... Logic giống code cũ
    // Lưu ý: Đảm bảo copy lại phần logic loadMoreMails từ code cũ vào đây
    try {
      setIsLoadingMore(true);
      const token = accessToken || (typeof window !== "undefined" ? window.__accessToken : null);
      if (!token) return;
      const maiURL =
        process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
      const response = await fetch(
        `${maiURL}/mailboxes/INBOX/emails?limit=20&pageToken=${nextPageToken}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) throw new Error("Failed");
      const data = await response.json();
      const newMails = Array.isArray(data?.messages) ? data.messages : [];
      setMails((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const uniqueNewMails = newMails.filter(
          (m: Mail) => !existingIds.has(m.id)
        );
        return [...prev, ...uniqueNewMails];
      });
      setNextPageToken(data.nextPageToken || null);
      setHasMore(!!data.nextPageToken);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Scroll handler for infinite scroll
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains("mailbox-scroll-target")) return;
      const { scrollTop, scrollHeight, clientHeight } = target;
      if (
        (scrollTop + clientHeight) / scrollHeight > 0.8 &&
        hasMore &&
        !isLoadingMore
      ) {
        loadMoreMails();
      }
    };
    const container = document.querySelector(".mailbox-scroll-target");
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [hasMore, isLoadingMore, nextPageToken]);

  // Handler select mail ... (Giữ nguyên logic)
  const handleSelectMail = async (mail: Mail) => {
    // ... Logic fetch detail mail giống cũ
    try {
      const token = typeof window !== "undefined" ? window.__accessToken : null;
      if (!token) return;
      const maiURL =
        process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
      const response = await fetch(`${maiURL}/emails/${mail.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed");
      const data = await response.json();
      setSelectedMail(data);
    } catch (err) {
      console.error(err);
    }
  };

  // Hàm send email riêng cho Forward Modal (vì modal này nằm trong Page)
  const handleForwardEmail = async (emailData: any) => {
    try {
      const token = accessToken || (typeof window !== "undefined" ? window.__accessToken : null);
      console.log('[Forward] Sending email:', { emailData, hasToken: !!token });
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
      
      console.log('[Forward] Response status:', response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('[Forward] Error response:', errorData);
        throw new Error(errorData.message || "Failed to send");
      }
      
      showToast("Email forwarded successfully", "success");
      setIsForwardOpen(false);
      return await response.json();
    } catch (error: any) {
      console.error('[Forward] Exception:', error);
      showToast(`Failed to forward: ${error.message}`, "error");
      throw error;
    }
  };

  // Handle delete email
  const handleDeleteEmail = (mailId: string) => {
    // Remove email from list
    setMails((prevMails) => prevMails.filter((mail) => mail.id !== mailId));
    // Close detail view
    setSelectedMail(null);
  };

  // Handle archive email
  const handleArchiveEmail = (mailId: string) => {
    // Remove email from list
    setMails((prevMails) => prevMails.filter((mail) => mail.id !== mailId));
    // Close detail view
    setSelectedMail(null);
  };

  if (isAuthLoading) return null; // Hoặc loading spinner
  if (!isAuthenticated) return null;

  // Render
  return (
    <div className="flex h-full w-full">
      {/* SideBar đã bị xóa khỏi đây vì nó nằm ở AppShell (Layout).
         ComposeModal cũng nằm ở AppShell.
      */}

      {/* Cột Danh sách Mail */}
      <div
        className={`
          h-full flex flex-col
          ${selectedMail ? "hidden" : "flex"} 
          md:flex md:w-1/3 w-full
        `}
      >
        {isMailsLoading && mails.length === 0 ? (
          <div className="flex items-center justify-center w-full h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <MailBox
            toggleSidebar={toggleSidebar}
            mails={mails}
            selectedMail={selectedMail}
            onSelectMail={handleSelectMail}
            focusedIndex={focusedIndex}
            isLoadingMore={isLoadingMore}
            isLoading={isMailsLoading}
            hasMore={hasMore}
            kanbanMode={isKanBanMode}
            kanbanClick={toggleKanBanMode}
            onRefresh={fetchInboxMails}
            searchQuery={searchQuery || undefined}
            onSearch={handleSearch}
            onClearSearch={onClearSearch}
            isSearching={isSearching}
            error={error}
            searchMode={searchMode}
            onSearchModeChange={setSearchMode}
          />
        )}
      </div>

      {/* Cột Nội dung Mail / Kanban */}
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
          onReplyClick={() => setReplyTrigger((prev) => prev + 1)}
          onDelete={handleDeleteEmail}
          onArchive={handleArchiveEmail}
          triggerReply={replyTrigger}
        />
      </div>

      {/* Forward Modal vẫn giữ ở Page vì nó phụ thuộc vào selectedMail */}
      {selectedMail && (
        <ForwardModal
          isOpen={isForwardOpen}
          onClose={() => setIsForwardOpen(false)}
          onSend={handleForwardEmail}
          originalMail={selectedMail}
        />
      )}
    </div>
  );
}
