"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useUI } from "@/contexts/ui-context";
import { useToast } from "@/contexts/toast-context";
import { useMailFolder } from "@/hooks/useMailFolder";
import MailBox from "@/components/ui/MailBox";
import MailContent from "@/components/ui/MailContent";
import ForwardModal from "@/components/ui/ForwardModal";
import Kanban from "@/components/ui/Kanban";
import { type EmailData, type Mail } from "@/types";
import { useSearch } from "@/hooks/useSearch";

// Mapping folder slug to Gmail Label ID
const FOLDER_MAP: Record<string, string> = {
  inbox: "INBOX",
  starred: "STARRED",
  sent: "SENT",
  drafts: "DRAFT",
  spam: "SPAM",
  trash: "TRASH",
  archive: "ARCHIVE",
};

// Helper function to get display name from folder slug
const getFolderDisplayName = (slug: string): string => {
  const displayNames: Record<string, string> = {
    inbox: "Inbox",
    starred: "Starred",
    sent: "Sent",
    drafts: "Drafts",
    spam: "Spam",
    trash: "Trash",
    archive: "Archive",
  };
  return displayNames[slug?.toLowerCase()] || "Inbox";
};

export default function FolderPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: isAuthLoading, isAuthInitialized, accessToken } = useAuth();
  const { isKanBanMode, toggleSidebar } = useUI();
  const { showToast } = useToast();

  // Get folder from URL params
  const folderSlug = params.folder as string;
  const folderId = FOLDER_MAP[folderSlug?.toLowerCase()] || "INBOX";
  const folderDisplayName = getFolderDisplayName(folderSlug);

  // Search query from URL
  const searchQuery = searchParams.get("q");

  // State for mails (will be updated by either useMailFolder or useSearch)
  const [mails, setMails] = useState<Mail[]>([]);

  // Use custom hook to fetch mails (only when NOT searching)
  const {
    mails: folderMails,
    isLoading: isMailsLoading,
    error,
    hasMore,
    isLoadingMore,
    loadMoreMails,
    refreshMails,
  } = useMailFolder({ folderId, searchQuery: null }); // Don't pass searchQuery

  // Use search hook for search functionality
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Stable callback for updating mails from search
  const handleMailsChange = useCallback((newMails: Mail[]) => {
    console.log('[Page] onMailsChange called with mails:', newMails.length);
    setMails(newMails);
  }, []);

  const {
    searchMode,
    setSearchMode,
    isSearching: hookIsSearching,
    error: hookSearchError,
    handleSearch,
    onClearSearch,
  } = useSearch({
    folderSlug,
    isAuthenticated,
    isAuthInitialized,
    accessToken,
    onMailsChange: handleMailsChange,
    onErrorChange: setSearchError,
    onLoadingChange: setIsSearching,
    onRefreshMails: refreshMails,
  });

  // Update mails when folder mails change (only if not searching)
  useEffect(() => {
    console.log('[Page] Folder mails effect:', { searchQuery, folderMailsCount: folderMails.length });
    if (!searchQuery) {
      console.log('[Page] Setting mails from folderMails:', folderMails.length);
      setMails(folderMails);
    }
  }, [folderMails, searchQuery]);

  // Combine errors
  const combinedError = error || searchError || hookSearchError;
  const [selectedMail, setSelectedMail] = useState<EmailData | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [isForwardOpen, setIsForwardOpen] = useState(false);
  const [replyTrigger, setReplyTrigger] = useState(0);
  const [triggerArchive, setTriggerArchive] = useState(0);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isAuthLoading, router]);

  // Handle mail click
  const handleMailClick = useCallback(async (mail: Mail) => {
    const mailId = mail.id;
    try {
      const token = typeof window !== "undefined" ? window.__accessToken : null;
      if (!token) return;

      const apiURL =
        process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
      const response = await fetch(`${apiURL}/emails/${mailId}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch email");

      const data = await response.json();
      setSelectedMail(data);
    } catch (err) {
      console.error("Error fetching email:", err);
    }
  }, []);

  // Handle send forward
  const handleSendForward = useCallback(
    async (emailData: {
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      body: string;
      isHtml: boolean;
    }) => {
      try {
        const token = accessToken || (typeof window !== "undefined" ? window.__accessToken : null);
        console.log('[Forward] Sending email:', { emailData, hasToken: !!token });
        if (!token) return;

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
          throw new Error(errorData.message || "Failed to send forward");
        }

        showToast("Email forwarded successfully", "success");
        setIsForwardOpen(false);
      } catch (err: any) {
        console.error('[Forward] Exception:', err);
        showToast(`Failed to forward: ${err.message}`, "error");
      }
    },
    [showToast, accessToken]
  );

  // Handle forward
  const handleForward = useCallback(() => {
    setIsForwardOpen(true);
  }, []);

  // Handle reply trigger
  const handleReply = useCallback(() => {
    setReplyTrigger((prev) => prev + 1);
  }, []);

  // Handle delete email
  const handleDeleteEmail = useCallback(
    (mailId: string) => {
      // Close detail view
      setSelectedMail(null);
      // Refresh mail list to reflect deletion
      refreshMails();
    },
    [refreshMails]
  );

  // Handle archive email
  const handleArchiveEmail = useCallback(
    (mailId: string) => {
      // Close detail view
      setSelectedMail(null);
      // Refresh mail list to reflect archive
      refreshMails();
    },
    [refreshMails]
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, mails.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && mails[focusedIndex]) {
        handleMailClick(mails[focusedIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mails, focusedIndex, handleMailClick]);

  // Reset focused index when mails change
  useEffect(() => {
    setFocusedIndex(0);
  }, [mails]);

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
  }, [hasMore, isLoadingMore, loadMoreMails]);

  // Show loading state
  if (isAuthLoading || (!isAuthenticated && !isAuthLoading)) {
    return null;
  }

  // Kanban mode
  if (isKanBanMode) {
    return <Kanban />;
  }

  return (
    <div className="flex h-full w-full">
      {/* Cột Danh sách Mail */}
      <div
        className={`
          h-full 
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
            onSelectMail={handleMailClick}
            focusedIndex={focusedIndex}
            isLoadingMore={isLoadingMore}
            isLoading={isMailsLoading}
            hasMore={hasMore}
            kanbanMode={isKanBanMode}
            kanbanClick={() => { }}
            onRefresh={refreshMails}
            searchQuery={searchQuery ?? undefined}
            onSearch={handleSearch}
            onClearSearch={onClearSearch}
            isSearching={isSearching}
            error={combinedError}
            searchMode={searchMode}
            onSearchModeChange={setSearchMode}
            folderName={folderDisplayName}
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
          onForwardClick={handleForward}
          onReplyClick={handleReply}
          onDelete={handleDeleteEmail}
            onArchive={handleArchiveEmail}
            triggerArchive={triggerArchive}
          triggerReply={replyTrigger}
        />
      </div>

      {/* Forward Modal */}
      {selectedMail && (
        <ForwardModal
          isOpen={isForwardOpen}
          onClose={() => setIsForwardOpen(false)}
          onSend={handleSendForward}
          originalMail={selectedMail}
        />
      )}
    </div>
  );
}
