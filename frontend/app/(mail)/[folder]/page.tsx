"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useUI } from "@/contexts/ui-context";
import { useMailFolder } from "@/hooks/useMailFolder";
import MailBox from "@/components/ui/MailBox";
import MailContent from "@/components/ui/MailContent";
import ForwardModal from "@/components/ui/ForwardModal";
import Kanban from "@/components/ui/Kanban";
import { type EmailData, type Mail } from "@/types";

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

export default function FolderPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isKanBanMode, toggleSidebar } = useUI();

  // Get folder from URL params
  const folderSlug = params.folder as string;
  const folderId = FOLDER_MAP[folderSlug?.toLowerCase()] || "INBOX";

  // Search query from URL
  const searchQuery = searchParams.get("q");

  // Use custom hook to fetch mails
  const {
    mails,
    isLoading: isMailsLoading,
    error,
    hasMore,
    isLoadingMore,
    loadMoreMails,
    refreshMails,
  } = useMailFolder({ folderId, searchQuery });

  // State for selected mail and UI
  const [selectedMail, setSelectedMail] = useState<EmailData | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [isForwardOpen, setIsForwardOpen] = useState(false);
  const [replyTrigger, setReplyTrigger] = useState(0);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isAuthLoading, router]);

  // Handle search
  const handleSearch = useCallback(
    (query: string) => {
      if (!query.trim()) return;
      router.push(`/${folderSlug}?q=${encodeURIComponent(query)}`);
    },
    [router, folderSlug]
  );

  // Clear search
  const handleClearSearch = useCallback(() => {
    router.push(`/${folderSlug}`);
  }, [router, folderSlug]);

  // Handle mail click
  const handleMailClick = useCallback(async (mail: Mail) => {
    const mailId = mail.id;
    try {
      const token = typeof window !== "undefined" ? window.__accessToken : null;
      if (!token) return;

      const apiURL =
        process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
      const response = await fetch(`${apiURL}/mails/${mailId}`, {
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
        const token =
          typeof window !== "undefined" ? window.__accessToken : null;
        if (!token) return;

        const apiURL =
          process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";

        const response = await fetch(`${apiURL}/mails/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(emailData),
        });

        if (!response.ok) throw new Error("Failed to send forward");

        alert("Email forwarded successfully!");
        setIsForwardOpen(false);
      } catch (err) {
        console.error("Error forwarding email:", err);
        alert("Failed to forward email. Please try again.");
      }
    },
    []
  );

  // Handle forward
  const handleForward = useCallback(() => {
    setIsForwardOpen(true);
  }, []);

  // Handle reply trigger
  const handleReply = useCallback(() => {
    setReplyTrigger((prev) => prev + 1);
  }, []);

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
            hasMore={hasMore}
            kanbanMode={isKanBanMode}
            kanbanClick={() => {}}
            searchQuery={searchQuery ?? undefined}
            onSearch={handleSearch}
            onClearSearch={handleClearSearch}
            isSearching={false}
            error={error}
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
