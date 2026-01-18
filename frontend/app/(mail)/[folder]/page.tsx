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
import { useKeyboardNavigation, KeyboardShortcutsModal } from "@/hooks/useKeyboardNavigation";

// Mapping folder slug to Gmail Label ID for known system folders
const FOLDER_MAP: Record<string, string> = {
  inbox: "INBOX",
  starred: "STARRED",
  important: "IMPORTANT",
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
  const { isKanBanMode, toggleSidebar, isComposeOpen, setComposeOpen } = useUI();
  const { showToast } = useToast();

  // Get folder from URL params (decode percent-encoding)
  const rawFolderParam = params.folder as string;
  const folderSlug = rawFolderParam ? decodeURIComponent(rawFolderParam) : rawFolderParam;
  const lower = folderSlug?.toLowerCase();
  const systemFolderId = FOLDER_MAP[lower];

  const slugify = (s?: string) =>
    (s || "")
      .toString()
      .trim()
      .toLowerCase()
      // normalize Unicode and strip diacritic marks (accents)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "");

  // State for label resolution
  // undefined = not resolved yet, null = resolved but not found, string = found
  const [resolvedFolderId, setResolvedFolderId] = useState<string | null | undefined>(
    systemFolderId ?? undefined
  );
  const [resolvedDisplayName, setResolvedDisplayName] = useState<string>(
    systemFolderId ? getFolderDisplayName(folderSlug) : folderSlug
  );
  const [isResolving, setIsResolving] = useState(!systemFolderId);

  // Resolve custom label slugs to Gmail label IDs
  useEffect(() => {
    let mounted = true;
    const resolveLabel = async () => {
      // If it's a known system folder, nothing to do
      if (systemFolderId) {
        setIsResolving(false);
        return;
      }

      setIsResolving(true);

      // If the slug already looks like a Gmail label id, use it directly
      if (folderSlug) {
        const idMatch = folderSlug.match(/(Label_\d+)$/);
        if (idMatch) {
          setResolvedFolderId(idMatch[1]);
          setIsResolving(false);
          return;
        }

        if (folderSlug.startsWith("Label_")) {
          setResolvedFolderId(folderSlug);
          setIsResolving(false);
          return;
        }
      }

      // Otherwise fetch mailboxes and try to match by slugified name
      try {
        const token = typeof window !== "undefined" ? (window as any).__accessToken : null;
        if (!token) {
          setIsResolving(false);
          return;
        }
        const apiURL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
        const res = await fetch(`${apiURL}/mailboxes`, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          credentials: 'include'
        });
        if (!res.ok) {
          setIsResolving(false);
          return;
        }
        const boxes = await res.json();
        if (!mounted) return;

        // Try to match by slugified name or by id
        const target = (boxes || []).find((b: any) => {
          const nameSlug = slugify(b.name) || "";
          const folderSlugSlug = slugify(folderSlug || "") || "";
          if (nameSlug && nameSlug === folderSlugSlug) return true;
          if (`${nameSlug}-${b.id}` === folderSlugSlug) return true;
          // direct id match (when URL used label id)
          if (b.id === folderSlug) return true;
          return false;
        });

        if (target) {
          setResolvedFolderId(target.id);
          setResolvedDisplayName(target.name || folderSlug);
        } else {
          // Not found
          setResolvedFolderId(null);
        }
      } catch (err) {
        console.error('Failed to resolve label slug', err);
        setResolvedFolderId(null);
      } finally {
        if (mounted) setIsResolving(false);
      }
    };

    resolveLabel();
    return () => { mounted = false; };
  }, [folderSlug, systemFolderId]);

  // Search query from URL
  const searchQuery = searchParams.get("q");

  // State for mails
  const [mails, setMails] = useState<Mail[]>([]);

  // Only fetch when we have a resolved folder ID
  const RESOLVING_LABEL = "RESOLVING_LABEL";
  const NOT_FOUND_LABEL = "NOT_FOUND_LABEL";

  // Determine effective folder id without falling back to INBOX for custom labels.
  // Order: system folder -> resolving sentinel -> resolved mailbox id -> not-found sentinel.
  let effectiveFolderId: string;
  if (systemFolderId) {
    effectiveFolderId = systemFolderId;
  } else if (isResolving) {
    effectiveFolderId = RESOLVING_LABEL;
  } else if (typeof resolvedFolderId === "string" && resolvedFolderId) {
    effectiveFolderId = resolvedFolderId;
  } else {
    effectiveFolderId = NOT_FOUND_LABEL;
  }

  const {
    mails: folderMails,
    isLoading: isMailsLoading,
    error,
    hasMore,
    isLoadingMore,
    loadMoreMails,
    refreshMails,
  } = useMailFolder({ 
    folderId: effectiveFolderId, 
    searchQuery: null,
  });

  // Search hook
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

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

  // Update mails when folder mails change (only if not searching and not resolving)
  useEffect(() => {
    if (!searchQuery && !isResolving) {
      setMails(folderMails);
    }
  }, [folderMails, searchQuery, isResolving]);

  // Combine errors
  const combinedError = error || searchError || hookSearchError;
  const [selectedMail, setSelectedMail] = useState<EmailData | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [triggerStar, setTriggerStar] = useState(0);
  const [isForwardOpen, setIsForwardOpen] = useState(false);
  const [replyTrigger, setReplyTrigger] = useState(0);
  const [triggerArchive, setTriggerArchive] = useState(0);
  const [triggerDelete, setTriggerDelete] = useState(0);
  const [triggerMarkRead, setTriggerMarkRead] = useState(0);
  const [triggerMarkUnread, setTriggerMarkUnread] = useState(0);
  const [triggerMarkReadAuto, setTriggerMarkReadAuto] = useState(0);
  const [triggerToggle, setTriggerToggle] = useState(0);

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
      // Auto-mark read when opening detail if unread
      const isUnread = Array.isArray(data?.labelIds) && data.labelIds.includes("UNREAD");
      if (isUnread) {
        setMails(prev => prev.map(m => m.id === data.id ? { ...m, labelIds: (m.labelIds || []).filter(l => l !== 'UNREAD'), isUnread: false } : m));
        setTriggerMarkReadAuto((t) => t + 1);
      }
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

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
          throw new Error(errorData.message || "Failed to send forward");
        }

        showToast("Email forwarded successfully", "success");
        setIsForwardOpen(false);
      } catch (err: any) {
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
    async (mailId: string) => {
      const confirmed = window.confirm(
        "Are you sure you want to delete this email? It will be moved to Trash."
      );
      if (!confirmed) return;

      try {
        const token = accessToken || (typeof window !== "undefined" ? window.__accessToken : null);
        if (!token) throw new Error("Not authenticated");
        const apiURL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";

        const response = await fetch(`${apiURL}/emails/${mailId}/modify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: "delete" }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to delete email");
        }

        setMails((prevMails) => prevMails.filter((m) => m.id !== mailId));
        setSelectedMail(null);
        showToast("Email moved to trash", "success");
      } catch (error: any) {
        console.error("Delete failed:", error);
        showToast(`Delete failed: ${error?.message || "Please try again"}`, "error");
      }
    },
    [accessToken, showToast]
  );

  // Handle archive email
  const handleArchiveEmail = useCallback(
    (mailId: string) => {
      setSelectedMail(null);
      refreshMails();
    },
    [refreshMails]
  );

  // Keyboard navigation
  const { showShortcuts, setShowShortcuts } = useKeyboardNavigation({
    onNextEmail: () => setFocusedIndex((i) => Math.min(i + 1, mails.length - 1)),
    onPreviousEmail: () => setFocusedIndex((i) => Math.max(i - 1, 0)),
    onOpenEmail: () => mails[focusedIndex] && handleMailClick(mails[focusedIndex]),
    onDelete: () => {
      if (selectedMail) {
        setTriggerDelete((t) => t + 1);
      } else if (mails[focusedIndex]) {
        handleDeleteEmail(mails[focusedIndex].id);
      }
    },
    onMarkRead: () => {
      if (selectedMail) {
        setTriggerMarkRead((t) => t + 1);
      } else if (mails[focusedIndex]) {
        (async () => {
          const mail = mails[focusedIndex];
          try {
            const token = accessToken || (typeof window !== "undefined" ? window.__accessToken : null);
            if (!token) return;
            const apiURL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
            const res = await fetch(`${apiURL}/emails/${mail.id}/modify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ action: 'markRead' }),
            });
            if (!res.ok) throw new Error('Failed to mark read');
            setMails((prev) => prev.map(m => m.id === mail.id ? { ...m, labelIds: (m.labelIds || []).filter(l => l !== 'UNREAD'), isUnread: false } : m));
          } catch (err) {
            console.error('Mark read failed', err);
          }
        })();
      }
    },
    onMarkUnread: () => {
      if (selectedMail) {
        setTriggerMarkUnread((t) => t + 1);
      } else if (mails[focusedIndex]) {
        (async () => {
          const mail = mails[focusedIndex];
          try {
            const token = accessToken || (typeof window !== "undefined" ? window.__accessToken : null);
            if (!token) return;
            const apiURL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
            const res = await fetch(`${apiURL}/emails/${mail.id}/modify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ action: 'markUnread' }),
            });
            if (!res.ok) throw new Error('Failed to mark unread');
            setMails((prev) => prev.map(m => m.id === mail.id ? { ...m, labelIds: Array.from(new Set([...(m.labelIds||[]),'UNREAD'])), isUnread: true } : m));
          } catch (err) {
            console.error('Mark unread failed', err);
          }
        })();
      }
    },
    onToggleRead: () => {
      if (selectedMail) {
        setTriggerToggle((t) => t + 1);
        setTimeout(() => setTriggerToggle(0), 80);
      } else if (mails[focusedIndex]) {
        (async () => {
          const mail = mails[focusedIndex];
          try {
            const token = accessToken || (typeof window !== "undefined" ? window.__accessToken : null);
            if (!token) return;
            const apiURL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
            const isUnread = Array.isArray(mail.labelIds) && mail.labelIds.includes("UNREAD");
            const action = isUnread ? 'markRead' : 'markUnread';
            const res = await fetch(`${apiURL}/emails/${mail.id}/modify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ action }),
            });
            if (!res.ok) throw new Error('Failed to toggle read');
            if (isUnread) {
              setMails((prev) => prev.map(m => m.id === mail.id ? { ...m, labelIds: (m.labelIds || []).filter(l => l !== 'UNREAD'), isUnread: false } : m));
            } else {
              setMails((prev) => prev.map(m => m.id === mail.id ? { ...m, labelIds: Array.from(new Set([...(m.labelIds||[]),'UNREAD'])), isUnread: true } : m));
            }
          } catch (err) {
            console.error('Toggle read failed', err);
          }
        })();
      }
    },
    onArchive: () => {
      if (selectedMail) {
        setTriggerArchive((t) => t + 1);
      } else if (mails[focusedIndex]) {
        handleArchiveEmail(mails[focusedIndex].id);
      }
    },
    onReply: () => {
      if (mails[focusedIndex]) {
        handleMailClick(mails[focusedIndex]);
        setReplyTrigger((t) => t + 1);
      }
    },
    onStar: () => {
      if (selectedMail) {
        setTriggerStar((t) => t + 1);
      } else if (mails[focusedIndex]) {
        (async () => {
          const mail = mails[focusedIndex];
          const isStarred = mail.labelIds?.includes("STARRED");
          const action = isStarred ? "unstar" : "star";
          try {
            const token = accessToken || (typeof window !== "undefined" ? window.__accessToken : null);
            if (!token) return;
            const apiURL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
            const res = await fetch(`${apiURL}/emails/${mail.id}/modify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ action }),
            });
            if (!res.ok) throw new Error('Failed to toggle star');
            setMails((prev) => prev.map(m => m.id === mail.id ? { ...m, labelIds: isStarred ? (m.labelIds || []).filter(l=>l!="STARRED") : [...(m.labelIds||[]), "STARRED"] } : m));
          } catch (err) {
            console.error('Toggle star failed', err);
          }
        })();
      }
    },
    onForward: () => {
      if (selectedMail) {
        setIsForwardOpen(true);
      } else if (mails[focusedIndex]) {
        handleMailClick(mails[focusedIndex]);
        setIsForwardOpen(true);
      }
    },
    onOpenInGmail: () => {
      try {
        const mail = selectedMail || mails[focusedIndex];
        if (!mail) return;
        const threadId = (mail as any).threadId || (mail as any).id;
        if (!threadId) return;
        const url = `https://mail.google.com/mail/u/0/#all/${threadId}`;
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (err) {
        console.error('Open in Gmail keyboard handler failed', err);
      }
    },
    onSearch: () => {
      const input = document.querySelector('.mailbox-search-input') as HTMLInputElement | null;
      input?.focus();
    },
    onClearSearch: onClearSearch,
    isEmailOpen: !!selectedMail,
    onCompose: () => setComposeOpen(true),
    isComposing: Boolean(isComposeOpen || isForwardOpen),
  });

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

  // Show loading while resolving label
  const isLoading = isResolving || (isMailsLoading && mails.length === 0);

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
        {isLoading ? (
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
            onFocusedIndexChange={setFocusedIndex}
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
            folderName={resolvedDisplayName}
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
          performServerDelete={false}
          suppressDeleteToast={true}
          triggerDelete={triggerDelete}
          onArchive={handleArchiveEmail}
          triggerStar={triggerStar}
          triggerArchive={triggerArchive}
          triggerReply={replyTrigger}
          triggerMarkRead={triggerMarkRead}
          triggerToggleRead={triggerToggle}
          triggerMarkReadAuto={triggerMarkReadAuto}
          triggerMarkUnread={triggerMarkUnread}
          onMarkRead={(mailId: string) => {
            setMails(prev => prev.map(m => m.id === mailId ? { ...m, labelIds: (m.labelIds||[]).filter(l => l !== 'UNREAD'), isUnread: false } : m));
            setSelectedMail(prev => prev && prev.id === mailId ? { ...prev, labelIds: (prev.labelIds||[]).filter(l => l !== 'UNREAD') } : prev);
          }}
          onMarkUnread={(mailId: string) => {
            setMails(prev => prev.map(m => m.id === mailId ? { ...m, labelIds: Array.from(new Set([...(m.labelIds||[]),'UNREAD'])), isUnread: true } : m));
            setSelectedMail(prev => prev && prev.id === mailId ? { ...prev, labelIds: Array.from(new Set([...(prev.labelIds||[]),'UNREAD'])) } : prev);
          }}
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
      {showShortcuts && (
        <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
}