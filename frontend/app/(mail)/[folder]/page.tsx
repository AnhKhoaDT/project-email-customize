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
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isKanBanMode, toggleSidebar } = useUI();

<<<<<<< Updated upstream
  // Get folder from URL params
  const folderSlug = params.folder as string;
  const folderId = FOLDER_MAP[folderSlug?.toLowerCase()] || "INBOX";
  const folderDisplayName = getFolderDisplayName(folderSlug);
=======
  // Get folder from URL params (decode percent-encoding)
  const rawFolderParam = params.folder as string;
  const folderSlug = rawFolderParam
    ? decodeURIComponent(rawFolderParam)
    : rawFolderParam;
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

  // Filter & Sort state
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | null>(null);
  const [filterUnread, setFilterUnread] = useState(false);
  const [filterAttachments, setFilterAttachments] = useState(false);

  // Debug: Log state changes
  useEffect(() => {
    console.log("Filter state changed:", {
      sortBy,
      filterUnread,
      filterAttachments,
    });
  }, [sortBy, filterUnread, filterAttachments]);

  // State for label resolution
  // undefined = not resolved yet, null = resolved but not found, string = found
  const [resolvedFolderId, setResolvedFolderId] = useState<
    string | null | undefined
  >(systemFolderId ?? undefined);
  const [resolvedDisplayName, setResolvedDisplayName] = useState<string>(
    systemFolderId ? getFolderDisplayName(folderSlug) : folderSlug,
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
        const token =
          typeof window !== "undefined" ? (window as any).__accessToken : null;
        if (!token) {
          setIsResolving(false);
          return;
        }
        const apiURL =
          process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
        const res = await fetch(`${apiURL}/mailboxes`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        });
        if (!res.ok) {
          setIsResolving(false);
          return;
        }
        const boxes = await res.json();
        if (!mounted) return;

        // Validate that boxes is an array (API might return error object)
        if (!Array.isArray(boxes)) {
          console.error('[Label Resolution] API returned non-array:', boxes);
          setResolvedFolderId(null);
          setIsResolving(false);
          return;
        }

        // Try to match by slugified name or by id
        const target = boxes.find((b: any) => {
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
        console.error("Failed to resolve label slug", err);
        setResolvedFolderId(null);
      } finally {
        if (mounted) setIsResolving(false);
      }
    };

    resolveLabel();
    return () => {
      mounted = false;
    };
  }, [folderSlug, systemFolderId]);
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
  } = useMailFolder({ folderId, searchQuery: null }); // Don't pass searchQuery
=======
    removeMailById,
    updateMailById,
  } = useMailFolder({
    folderId: effectiveFolderId,
    searchQuery: null,
  });
>>>>>>> Stashed changes

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
    onMailsChange: handleMailsChange,
    onErrorChange: setSearchError,
    onLoadingChange: setIsSearching,
  });

  // Update mails when folder mails change (only if not searching)
  useEffect(() => {
    console.log('[Page] Folder mails effect:', { searchQuery, folderMailsCount: folderMails.length });
    if (!searchQuery) {
      console.log('[Page] Setting mails from folderMails:', folderMails.length);
      setMails(folderMails);
    }
  }, [folderMails, searchQuery]);

  // Update local states from hook
  useEffect(() => {
    setIsSearching(hookIsSearching);
  }, [hookIsSearching]);

  // Combine errors
  const combinedError = error || searchError || hookSearchError;
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
<<<<<<< Updated upstream
=======
      // Auto-mark read when opening detail if unread
      const isUnread =
        Array.isArray(data?.labelIds) && data.labelIds.includes("UNREAD");
      if (isUnread) {
        const updates = {
          labelIds: (mail.labelIds || []).filter((l) => l !== "UNREAD"),
          isUnread: false,
        };
        setMails((prev) =>
          prev.map((m) =>
            m.id === data.id
              ? { ...m, ...updates }
              : m,
          ),
        );
        updateMailById(data.id, updates);
        setTriggerMarkReadAuto((t) => t + 1);
      }
>>>>>>> Stashed changes
    } catch (err) {
      console.error("Error fetching email:", err);
    }
  }, [updateMailById]);

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

        const response = await fetch(`${apiURL}/emails/send`, {
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

  // Handle delete email
  const handleDeleteEmail = useCallback(
<<<<<<< Updated upstream
    (mailId: string) => {
      // Close detail view
      setSelectedMail(null);
      // Refresh mail list to reflect deletion
      refreshMails();
    },
    [refreshMails]
=======
    async (mailId: string) => {
      const confirmed = window.confirm(
        "Are you sure you want to delete this email? It will be moved to Trash.",
      );
      if (!confirmed) return;

      try {
        const token =
          accessToken ||
          (typeof window !== "undefined" ? window.__accessToken : null);
        if (!token) throw new Error("Not authenticated");
        const apiURL =
          process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";

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

        // Remove from both local state and folder state
        setMails((prevMails) => prevMails.filter((m) => m.id !== mailId));
        removeMailById(mailId);
        setSelectedMail(null);
        showToast("Email moved to trash", "success");
      } catch (error: any) {
        console.error("Delete failed:", error);
        showToast(
          `Delete failed: ${error?.message || "Please try again"}`,
          "error",
        );
      }
    },
    [accessToken, showToast, removeMailById],
>>>>>>> Stashed changes
  );

  // Handle archive email
  const handleArchiveEmail = useCallback(
    (mailId: string) => {
<<<<<<< Updated upstream
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
=======
      // Remove from both local state and folder state
      removeMailById(mailId);
      setSelectedMail(null);
      // No need to call refreshMails() anymore
    },
    [removeMailById],
  );

  // Keyboard navigation
  const { showShortcuts, setShowShortcuts } = useKeyboardNavigation({
    onNextEmail: () =>
      setFocusedIndex((i) => Math.min(i + 1, mails.length - 1)),
    onPreviousEmail: () => setFocusedIndex((i) => Math.max(i - 1, 0)),
    onOpenEmail: () =>
      mails[focusedIndex] && handleMailClick(mails[focusedIndex]),
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
            const token =
              accessToken ||
              (typeof window !== "undefined" ? window.__accessToken : null);
            if (!token) return;
            const apiURL =
              process.env.NEXT_PUBLIC_BACKEND_API_URL ||
              "http://localhost:5000";
            const res = await fetch(`${apiURL}/emails/${mail.id}/modify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ action: "markRead" }),
            });
            if (!res.ok) throw new Error("Failed to mark read");
            const updates = {
              labelIds: (mail.labelIds || []).filter((l) => l !== "UNREAD"),
              isUnread: false,
            };
            setMails((prev) =>
              prev.map((m) => (m.id === mail.id ? { ...m, ...updates } : m)),
            );
            updateMailById(mail.id, updates);
          } catch (err) {
            console.error("Mark read failed", err);
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
            const token =
              accessToken ||
              (typeof window !== "undefined" ? window.__accessToken : null);
            if (!token) return;
            const apiURL =
              process.env.NEXT_PUBLIC_BACKEND_API_URL ||
              "http://localhost:5000";
            const res = await fetch(`${apiURL}/emails/${mail.id}/modify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ action: "markUnread" }),
            });
            if (!res.ok) throw new Error("Failed to mark unread");
            const updates = {
              labelIds: Array.from(new Set([...(mail.labelIds || []), "UNREAD"])),
              isUnread: true,
            };
            setMails((prev) =>
              prev.map((m) => (m.id === mail.id ? { ...m, ...updates } : m)),
            );
            updateMailById(mail.id, updates);
          } catch (err) {
            console.error("Mark unread failed", err);
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
            const token =
              accessToken ||
              (typeof window !== "undefined" ? window.__accessToken : null);
            if (!token) return;
            const apiURL =
              process.env.NEXT_PUBLIC_BACKEND_API_URL ||
              "http://localhost:5000";
            const isUnread =
              Array.isArray(mail.labelIds) && mail.labelIds.includes("UNREAD");
            const action = isUnread ? "markRead" : "markUnread";
            const res = await fetch(`${apiURL}/emails/${mail.id}/modify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ action }),
            });
            if (!res.ok) throw new Error("Failed to toggle read");
            const updates = isUnread
              ? {
                labelIds: (mail.labelIds || []).filter((l) => l !== "UNREAD"),
                isUnread: false,
              }
              : {
                labelIds: Array.from(new Set([...(mail.labelIds || []), "UNREAD"])),
                isUnread: true,
              };
            setMails((prev) =>
              prev.map((m) => (m.id === mail.id ? { ...m, ...updates } : m)),
            );
            updateMailById(mail.id, updates);
          } catch (err) {
            console.error("Toggle read failed", err);
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
>>>>>>> Stashed changes
        handleMailClick(mails[focusedIndex]);
      }
<<<<<<< Updated upstream
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mails, focusedIndex, handleMailClick]);
=======
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
            const token =
              accessToken ||
              (typeof window !== "undefined" ? window.__accessToken : null);
            if (!token) return;
            const apiURL =
              process.env.NEXT_PUBLIC_BACKEND_API_URL ||
              "http://localhost:5000";
            const res = await fetch(`${apiURL}/emails/${mail.id}/modify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ action }),
            });
            if (!res.ok) throw new Error("Failed to toggle star");
            const updates = {
              labelIds: isStarred
                ? (mail.labelIds || []).filter((l) => l !== "STARRED")
                : [...(mail.labelIds || []), "STARRED"],
            };
            setMails((prev) =>
              prev.map((m) => (m.id === mail.id ? { ...m, ...updates } : m)),
            );
            updateMailById(mail.id, updates);
          } catch (err) {
            console.error("Toggle star failed", err);
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
        console.error("Open in Gmail keyboard handler failed", err);
      }
    },
    onSearch: () => {
      const input = document.querySelector(
        ".mailbox-search-input",
      ) as HTMLInputElement | null;
      input?.focus();
    },
    onClearSearch: onClearSearch,
    isEmailOpen: !!selectedMail,
    onCompose: () => setComposeOpen(true),
    isComposing: Boolean(isComposeOpen || isForwardOpen),
  });
>>>>>>> Stashed changes

  // Reset focused index when mails change
  useEffect(() => {
    setFocusedIndex(0);
  }, [mails]);

  // Show loading state
  if (isAuthLoading || (!isAuthenticated && !isAuthLoading)) {
    return null;
  }

<<<<<<< Updated upstream
  // Kanban mode
  if (isKanBanMode) {
    return <Kanban />;
  }
=======
  // Remove Kanban mode UI (replaced by filter)

  // Apply filters and sorting
  const displayMails = useMemo(() => {
    console.log("Computing displayMails with filters:", {
      sortBy,
      filterUnread,
      filterAttachments,
      mailsCount: mails.length,
      isSearching: !!searchQuery,
    });
    // Use folderMails directly when not searching, use mails (search results) when searching
    const sourceMails = searchQuery ? mails : folderMails;
    let filtered = [...sourceMails];

    // Apply unread filter
    if (filterUnread) {
      filtered = filtered.filter(
        (mail) => mail.isUnread || mail.labelIds?.includes("UNREAD"),
      );
      console.log("After unread filter:", filtered.length);
    }

    // Apply attachments filter
    if (filterAttachments) {
      filtered = filtered.filter((mail) => {
        // Check hasAttachment field from backend (most reliable)
        if (mail.hasAttachment === true) return true;

        // Fallback: check attachments array (for compatibility)
        if ((mail as any).attachments?.length > 0) return true;

        return false;
      });
      console.log("After attachments filter:", filtered.length);
    }

    // Apply sorting
    if (sortBy === "newest") {
      filtered.sort((a, b) => {
        // internalDate is a Unix timestamp in milliseconds as a string
        const dateA = parseInt((a as any).internalDate || "0");
        const dateB = parseInt((b as any).internalDate || "0");
        return dateB - dateA; // Newest first
      });
      console.log("Sorted by newest");
    } else if (sortBy === "oldest") {
      filtered.sort((a, b) => {
        // internalDate is a Unix timestamp in milliseconds as a string
        const dateA = parseInt((a as any).internalDate || "0");
        const dateB = parseInt((b as any).internalDate || "0");
        return dateA - dateB; // Oldest first
      });
      console.log("Sorted by oldest");
    }

    console.log("Final displayMails count:", filtered.length);
    return filtered;
  }, [
    folderMails,
    mails,
    searchQuery,
    filterUnread,
    filterAttachments,
    sortBy,
  ]);

  // Reset focusedIndex when displayMails changes to avoid out of bounds
  useEffect(() => {
    if (focusedIndex >= displayMails.length && displayMails.length > 0) {
      setFocusedIndex(0);
    }
  }, [displayMails.length, focusedIndex, setFocusedIndex]);

  // Show loading while resolving label
  const isLoading = isResolving || (isMailsLoading && mails.length === 0);
>>>>>>> Stashed changes

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
            kanbanClick={() => { }}
<<<<<<< Updated upstream
=======
            onRefresh={refreshMails}
>>>>>>> Stashed changes
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
          triggerReply={replyTrigger}
<<<<<<< Updated upstream
=======
          triggerMarkRead={triggerMarkRead}
          triggerToggleRead={triggerToggle}
          triggerMarkReadAuto={triggerMarkReadAuto}
          triggerMarkUnread={triggerMarkUnread}
          onMarkRead={(mailId: string) => {
            const updates = {
              labelIds: (mails.find((m) => m.id === mailId)?.labelIds || []).filter(
                (l) => l !== "UNREAD",
              ),
              isUnread: false,
            };
            setMails((prev) =>
              prev.map((m) => (m.id === mailId ? { ...m, ...updates } : m)),
            );
            updateMailById(mailId, updates);
            setSelectedMail((prev) =>
              prev && prev.id === mailId
                ? {
                  ...prev,
                  labelIds: (prev.labelIds || []).filter(
                    (l) => l !== "UNREAD",
                  ),
                }
                : prev,
            );
          }}
          onMarkUnread={(mailId: string) => {
            const updates = {
              labelIds: Array.from(
                new Set([...(mails.find((m) => m.id === mailId)?.labelIds || []), "UNREAD"]),
              ),
              isUnread: true,
            };
            setMails((prev) =>
              prev.map((m) => (m.id === mailId ? { ...m, ...updates } : m)),
            );
            updateMailById(mailId, updates);
            setSelectedMail((prev) =>
              prev && prev.id === mailId
                ? {
                  ...prev,
                  labelIds: Array.from(
                    new Set([...(prev.labelIds || []), "UNREAD"]),
                  ),
                }
                : prev,
            );
          }}
>>>>>>> Stashed changes
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
