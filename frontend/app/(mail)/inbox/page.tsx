"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import {
  useKeyboardNavigation,
  KeyboardShortcutsModal,
} from "@/hooks/useKeyboardNavigation";

export default function Home() {
  const router = useRouter();
  const {
    isAuthenticated,
    isLoading: isAuthLoading,
    isAuthInitialized,
    accessToken,
  } = useAuth();
  const { showToast } = useToast();

  // Lấy state từ Global UI Context thay vì state cục bộ
  const {
    isKanBanMode,
    toggleKanBanMode,
    toggleSidebar,
    isComposeOpen,
    setComposeOpen,
  } = useUI();

  // Filter & Sort state
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | null>(null);
  const [filterReadStatus, setFilterReadStatus] = useState<"all" | "unread" | "read">("all");
  const [filterAttachments, setFilterAttachments] = useState(false);

  // Debug: Log state changes
  useEffect(() => {
    console.log("Filter state changed:", {
      sortBy,
      filterReadStatus,
      filterAttachments,
    });
  }, [sortBy, filterReadStatus, filterAttachments]);

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

  // Trigger star for MailContent when detail open
  const [triggerStar, setTriggerStar] = useState(0);

  // Counter to trigger reply mode
  const [replyTrigger, setReplyTrigger] = useState(0);
  // Counter to trigger archive in MailContent (used when an email is open)
  const [triggerArchive, setTriggerArchive] = useState(0);
  // Counter to trigger delete in MailContent (used when an email is open)
  const [triggerDelete, setTriggerDelete] = useState(0);
  // Counters to trigger mark read/unread in MailContent (when detail open)
  const [triggerMarkRead, setTriggerMarkRead] = useState(0);
  const [triggerMarkUnread, setTriggerMarkUnread] = useState(0);
  // Counter to trigger toggle read/unread (keyboard 'm') in MailContent
  const [triggerToggle, setTriggerToggle] = useState(0);
  // Counter for automatic mark-read when opening a mail (no toast)
  const [triggerMarkReadAuto, setTriggerMarkReadAuto] = useState(0);

  // Fetch inbox mails function (reusable) - Define BEFORE useSearch
  const fetchInboxMails = useCallback(async () => {
    console.debug("[Inbox] fetchInboxMails called");
    setError(null); // Clear any previous errors
    try {
      setIsMailsLoading(true);
      const id = "INBOX";
      const limit = 20;

      // Use token from AuthContext instead of window.__accessToken
      const token =
        accessToken ||
        (typeof window !== "undefined" ? window.__accessToken : null);
      console.debug("[Inbox] Token check:", {
        hasToken: !!token,
        source: accessToken ? "AuthContext" : "window",
      });
      if (!token) {
        console.log("[Inbox] No token found, aborting fetch");
        setIsMailsLoading(false);
        return;
      }

      const maiURL =
        process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
      console.log(
        "[Inbox] Fetching from:",
        `${maiURL}/mailboxes/${id}/emails?limit=${limit}`,
      );
      const response = await fetch(
        `${maiURL}/mailboxes/${id}/emails?limit=${limit}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      console.log("[Inbox] Response status:", response.status);
      if (!response.ok) throw new Error("Failed to fetch mails");

      const data = await response.json();
      const fetched = Array.isArray(data?.messages)
        ? data.messages
        : Array.isArray(data)
          ? data
          : [];

      console.log("[Inbox] Fetched mails:", fetched.length);
      setMails(fetched);
      setNextPageToken(data.nextPageToken || null);
      setHasMore(!!data.nextPageToken);
    } catch (err: any) {
      console.error("[Inbox] Fetch error:", err);
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
    console.log("[Inbox] fetchInboxMails effect:", {
      isAuthenticated,
      searchQuery,
      isAuthLoading,
    });
    if (isAuthenticated && !searchQuery) {
      // Clear error when returning to inbox
      setError(null);
      fetchInboxMails();
    }
  }, [isAuthenticated, searchQuery, fetchInboxMails, isAuthLoading]);

  // Reset focused index when mail list changes
  useEffect(() => {
    setFocusedIndex(0);
  }, [mails.length]);

  // Keyboard shortcuts (global) using hook
  const { showShortcuts, setShowShortcuts } = useKeyboardNavigation({
    onNextEmail: () =>
      setFocusedIndex((i) => Math.min(i + 1, mails.length - 1)),
    onPreviousEmail: () => setFocusedIndex((i) => Math.max(i - 1, 0)),
    onOpenEmail: () =>
      mails[focusedIndex] && handleSelectMail(mails[focusedIndex]),
    onDelete: () => {
      if (selectedMail) {
        setTriggerDelete((t) => t + 1);
      } else if (mails[focusedIndex]) {
        handleDeleteEmail(mails[focusedIndex].id);
      }
    },
    onArchive: () => {
      if (selectedMail) {
        // Let MailContent handle the archive when detail is open
        setTriggerArchive((t) => t + 1);
      } else if (mails[focusedIndex]) {
        handleArchiveEmail(mails[focusedIndex].id);
      }
    },
    onMarkRead: () => {
      if (selectedMail) {
        setTriggerMarkRead((t) => t + 1);
      } else if (mails[focusedIndex]) {
        // Mark focused mail in list as read
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
            setMails((prev) =>
              prev.map((m) =>
                m.id === mail.id
                  ? {
                    ...m,
                    labelIds: (m.labelIds || []).filter(
                      (l) => l !== "UNREAD",
                    ),
                    isUnread: false,
                  }
                  : m,
              ),
            );
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
            setMails((prev) =>
              prev.map((m) =>
                m.id === mail.id
                  ? {
                    ...m,
                    labelIds: Array.from(
                      new Set([...(m.labelIds || []), "UNREAD"]),
                    ),
                    isUnread: true,
                  }
                  : m,
              ),
            );
          } catch (err) {
            console.error("Mark unread failed", err);
          }
        })();
      }
    },
    onToggleRead: () => {
      if (selectedMail) {
        // Let MailContent handle the toggle when detail is open
        setTriggerToggle((t) => t + 1);
        // reset shortly to avoid stale triggers
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
            if (isUnread) {
              setMails((prev) =>
                prev.map((m) =>
                  m.id === mail.id
                    ? {
                      ...m,
                      labelIds: (m.labelIds || []).filter(
                        (l) => l !== "UNREAD",
                      ),
                      isUnread: false,
                    }
                    : m,
                ),
              );
            } else {
              setMails((prev) =>
                prev.map((m) =>
                  m.id === mail.id
                    ? {
                      ...m,
                      labelIds: Array.from(
                        new Set([...(m.labelIds || []), "UNREAD"]),
                      ),
                      isUnread: true,
                    }
                    : m,
                ),
              );
            }
          } catch (err) {
            console.error("Toggle read failed", err);
          }
        })();
      }
    },
    onReply: () => {
      if (mails[focusedIndex]) {
        // Fetch full email data before opening reply mode to ensure EmailData shape
        handleSelectMail(mails[focusedIndex]);
        setReplyTrigger((t) => t + 1);
      }
    },
    onStar: () => {
      if (selectedMail) {
        setTriggerStar((t) => t + 1);
      } else if (mails[focusedIndex]) {
        // Toggle star for focused mail in list view
        (async () => {
          const mail = mails[focusedIndex];
          const isStarred = mail.labelIds?.includes("STARRED");
          const action = isStarred ? "unstar" : "star";
          try {
            const token =
              accessToken ||
              (typeof window !== "undefined" ? window.__accessToken : null);
            if (!token) {
              console.warn("[Inbox page] onStar: no auth token, aborting");
              return;
            }
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
            setMails((prev) =>
              prev.map((m) =>
                m.id === mail.id
                  ? {
                    ...m,
                    labelIds: isStarred
                      ? (m.labelIds || []).filter((l) => l != "STARRED")
                      : [...(m.labelIds || []), "STARRED"],
                  }
                  : m,
              ),
            );
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
        // Open forward for focused mail: fetch and set selected, then open forward modal
        handleSelectMail(mails[focusedIndex]);
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

  // Load more function ... (Giữ nguyên logic cũ của bạn)
  const loadMoreMails = async () => {
    if (!hasMore || isLoadingMore || !nextPageToken) return;
    // ... Logic giống code cũ
    // Lưu ý: Đảm bảo copy lại phần logic loadMoreMails từ code cũ vào đây
    try {
      setIsLoadingMore(true);
      const token =
        accessToken ||
        (typeof window !== "undefined" ? window.__accessToken : null);
      if (!token) return;
      const maiURL =
        process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
      const response = await fetch(
        `${maiURL}/mailboxes/INBOX/emails?limit=20&pageToken=${nextPageToken}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) throw new Error("Failed");
      const data = await response.json();
      const newMails = Array.isArray(data?.messages) ? data.messages : [];
      setMails((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const uniqueNewMails = newMails.filter(
          (m: Mail) => !existingIds.has(m.id),
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
      // If opened mail is unread, mark it as read locally and trigger MailContent to mark read
      const isUnread =
        Array.isArray(data?.labelIds) && data.labelIds.includes("UNREAD");
      if (isUnread) {
        setMails((prev) =>
          prev.map((m) =>
            m.id === data.id
              ? {
                ...m,
                labelIds: (m.labelIds || []).filter((l) => l !== "UNREAD"),
                isUnread: false,
              }
              : m,
          ),
        );
        setTriggerMarkReadAuto((t) => t + 1);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Hàm send email riêng cho Forward Modal (vì modal này nằm trong Page)
  const handleForwardEmail = async (emailData: any) => {
    try {
      const token =
        accessToken ||
        (typeof window !== "undefined" ? window.__accessToken : null);
      console.log("[Forward] Sending email:", { emailData, hasToken: !!token });
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

      console.log("[Forward] Response status:", response.status);
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: "Unknown error" }));
        console.error("[Forward] Error response:", errorData);
        throw new Error(errorData.message || "Failed to send");
      }

      showToast("Email forwarded successfully", "success");
      setIsForwardOpen(false);
      return await response.json();
    } catch (error: any) {
      console.error("[Forward] Exception:", error);
      showToast(`Failed to forward: ${error.message}`, "error");
      throw error;
    }
  };

  // Handle delete email (confirm + API call) — keep behavior consistent with MailContent
  const handleDeleteEmail = async (mailId: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this email? It will be moved to Trash.",
    );
    if (!confirmed) return;

    try {
      const token =
        accessToken ||
        (typeof window !== "undefined" ? window.__accessToken : null);
      if (!token) {
        throw new Error("Not authenticated");
      }
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

      // Success - update UI
      setMails((prevMails) => prevMails.filter((mail) => mail.id !== mailId));
      setSelectedMail(null);
      showToast("Email moved to trash", "success");
    } catch (error: any) {
      console.error("Delete failed:", error);
      showToast(
        `Delete failed: ${error?.message || "Please try again"}`,
        "error",
      );
    }
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

  // Apply filters and sorting
  const displayMails = useMemo(() => {
    console.log("Computing displayMails with filters:", {
      sortBy,
      filterReadStatus,
      filterAttachments,
      mailsCount: mails.length,
    });

    // Log sample mail to debug
    if (mails.length > 0) {
      console.log("Sample mail structure:", {
        id: mails[0].id,
        date: mails[0].date,
        hasAttachment: mails[0].hasAttachment,
        attachments: (mails[0] as any).attachments,
        internalDate: (mails[0] as any).internalDate,
      });
    }

    let filtered = [...mails];

    // Apply read status filter
    const isItemUnread = (item: any): boolean => {
      if (Array.isArray(item.labelIds)) {
        return item.labelIds.includes('UNREAD');
      }
      if (typeof item.isUnread === 'boolean') {
        return item.isUnread;
      }
      return false;
    };

    if (filterReadStatus === "unread") {
      filtered = filtered.filter((mail) => isItemUnread(mail));
      console.log("After unread filter:", filtered.length);
    } else if (filterReadStatus === "read") {
      filtered = filtered.filter((mail) => !isItemUnread(mail));
      console.log("After read filter:", filtered.length);
    }

    // Apply attachments filter
    if (filterAttachments) {
      const before = filtered.length;
      console.log("🔍 Checking attachments in all emails:");

      // First, let's see what we have
      filtered.forEach((mail, index) => {
        if (index < 5) {
          // Log first 5 emails for debugging
          console.log(`Email ${index + 1}:`, {
            id: mail.id,
            subject: mail.subject?.substring(0, 30),
            hasAttachment: mail.hasAttachment,
            attachments: (mail as any).attachments,
            attachmentsLength: (mail as any).attachments?.length,
          });
        }
      });

      filtered = filtered.filter((mail) => {
        const hasAttach =
          mail.hasAttachment || (mail as any).attachments?.length > 0;
        if (hasAttach) {
          console.log("✅ Mail WITH attachment kept:", {
            id: mail.id,
            subject: mail.subject?.substring(0, 30),
            hasAttachment: mail.hasAttachment,
            attachmentsCount: (mail as any).attachments?.length,
          });
        } else {
          if (
            (mail as any).attachments !== undefined ||
            mail.hasAttachment !== undefined
          ) {
            console.log("❌ Mail WITHOUT attachment removed:", {
              id: mail.id,
              subject: mail.subject?.substring(0, 30),
              hasAttachment: mail.hasAttachment,
              attachments: (mail as any).attachments,
            });
          }
        }
        return hasAttach;
      });
      console.log(
        `After attachments filter: ${filtered.length} (removed ${before - filtered.length})`,
      );
    }

    // Apply sorting
    if (sortBy === "newest") {
      console.log("Applying newest sort...");
      filtered.sort((a, b) => {
        // internalDate is a Unix timestamp in milliseconds as a string
        const dateA = parseInt((a as any).internalDate || "0");
        const dateB = parseInt((b as any).internalDate || "0");
        console.log(`Comparing: ${a.date} (${dateA}) vs ${b.date} (${dateB})`);
        return dateB - dateA; // Newest first
      });
      console.log("Sorted by newest - first mail date:", filtered[0]?.date);
    } else if (sortBy === "oldest") {
      console.log("Applying oldest sort...");
      filtered.sort((a, b) => {
        // internalDate is a Unix timestamp in milliseconds as a string
        const dateA = parseInt((a as any).internalDate || "0");
        const dateB = parseInt((b as any).internalDate || "0");
        return dateA - dateB; // Oldest first
      });
      console.log("Sorted by oldest - first mail date:", filtered[0]?.date);
    }

    console.log("Final displayMails count:", filtered.length);
    return filtered;
  }, [mails, filterReadStatus, filterAttachments, sortBy]);

  // Render
  return (
    <>
      {showShortcuts && (
        <KeyboardShortcutsModal
          isOpen={showShortcuts}
          onClose={() => setShowShortcuts(false)}
        />
      )}
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
              mails={displayMails}
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
              onFocusedIndexChange={setFocusedIndex}
              sortBy={sortBy}
              onSortChange={setSortBy}
              filterReadStatus={filterReadStatus}
              onFilterReadStatusChange={setFilterReadStatus}
              filterAttachments={filterAttachments}
              onFilterAttachmentsChange={setFilterAttachments}
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
            // Parent will perform server delete for inbox selection; suppress child toast
            performServerDelete={false}
            suppressDeleteToast={true}
            triggerDelete={triggerDelete}
            onArchive={handleArchiveEmail}
            triggerArchive={triggerArchive}
            triggerReply={replyTrigger}
            triggerStar={triggerStar}
            triggerMarkRead={triggerMarkRead}
            triggerMarkReadAuto={triggerMarkReadAuto}
            triggerMarkUnread={triggerMarkUnread}
            triggerToggleRead={triggerToggle}
            onMarkRead={(mailId: string) => {
              setMails((prev) =>
                prev.map((m) =>
                  m.id === mailId
                    ? {
                      ...m,
                      labelIds: (m.labelIds || []).filter(
                        (l) => l !== "UNREAD",
                      ),
                      isUnread: false,
                    }
                    : m,
                ),
              );
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
              setMails((prev) =>
                prev.map((m) =>
                  m.id === mailId
                    ? {
                      ...m,
                      labelIds: Array.from(
                        new Set([...(m.labelIds || []), "UNREAD"]),
                      ),
                      isUnread: true,
                    }
                    : m,
                ),
              );
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
    </>
  );
}
