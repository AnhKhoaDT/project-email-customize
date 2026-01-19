import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { type Mail } from "@/types";

interface UseMailFolderOptions {
  folderId: string;
  searchQuery?: string | null;
  enabled?: boolean;
  sortBy?: string | null;
  filterUnread?: boolean;
  filterAttachment?: boolean;
}

interface UseMailFolderReturn {
  mails: Mail[];
  isLoading: boolean;
  error: string | null;
  nextPageToken: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreMails: () => Promise<void>;
  refreshMails: () => Promise<void>;
  removeMailById: (mailId: string) => void;
  updateMailById: (mailId: string, updates: Partial<Mail>) => void;
}

export function useMailFolder({
  folderId,
  searchQuery,
  sortBy = null,
  filterUnread = false,
  filterAttachment = false,
}: UseMailFolderOptions): UseMailFolderReturn {
  const { isAuthenticated, isLoading: isAuthLoading, accessToken } = useAuth();

  const [mails, setMails] = useState<Mail[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(() =>
    folderId !== "RESOLVING_LABEL" && folderId !== "NOT_FOUND_LABEL"
  );
  const [error, setError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Fetch mails for a specific folder
  const fetchMails = useCallback(
    async (pageToken?: string) => {
      // Handle special sentinels
      if (folderId === "RESOLVING_LABEL") {
        console.log("[useMailFolder] Skipping fetch while label slug is resolving");
        setIsLoading(false);
        return;
      }

      if (folderId === "NOT_FOUND_LABEL") {
        console.log("[useMailFolder] Label slug resolved but mailbox not found");
        setError("Folder not found");
        setIsLoading(false);
        setMails([]);
        setHasMore(false);
        setNextPageToken(null);
        return;
      }
      console.log('[useMailFolder] fetchMails:', { isAuthLoading, isAuthenticated, hasToken: !!accessToken });
      // Wait for auth to complete before checking authentication
      if (isAuthLoading) return;
      if (!isAuthenticated) return;

      setError(null);

      try {
        if (!pageToken) {
          setIsLoading(true);
        }

        // Use token from AuthContext instead of window
        const token = accessToken || (typeof window !== "undefined" ? window.__accessToken : null);
        if (!token) {
          setError("Authentication token is missing. Please log in again.");
          setIsLoading(false);
          return;
        }

        const apiURL =
          process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
        const limit = 20;

        // Check if filters are active (must check for actual values, not falsy)
        const hasFilters = sortBy !== null || filterUnread === true || filterAttachment === true;
        
        console.log('[useMailFolder] Filter state:', { 
          sortBy, 
          filterUnread, 
          filterAttachment, 
          hasFilters 
        });

        // Build URL with pagination and filters
        let url = hasFilters 
          ? `${apiURL}/mailboxes/${folderId}/emails/filtered?limit=${limit}`
          : `${apiURL}/mailboxes/${folderId}/emails?limit=${limit}`;
        
        console.log('[useMailFolder] Using endpoint:', url);
        
        if (pageToken) {
          url += `&pageToken=${pageToken}`;
        }
        
        // Add filter params if active
        if (sortBy) {
          url += `&sortBy=${sortBy}`;
        }
        if (filterUnread) {
          url += `&filterUnread=true`;
        }
        if (filterAttachment) {
          url += `&filterAttachment=true`;
        }

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.status === 401) {
          setError("Session expired. Please log in again.");
          setIsLoading(false);
          return;
        }

        if (!response.ok) throw new Error("Failed to fetch mails");

        const data = await response.json();
        
        // Handle different response formats
        // - Filtered endpoint: { status: 200, data: { messages: [...] } }
        // - Normal endpoint: { messages: [...] } or [...]
        const rawMessages = Array.isArray(data?.data?.messages)
          ? data.data.messages
          : Array.isArray(data?.messages)
            ? data.messages
            : Array.isArray(data)
              ? data
              : [];

        console.log('[useMailFolder] Parsed messages:', rawMessages.length);

        // Transform messages to ensure isUnread is properly set from labelIds
        const fetched = rawMessages.map((msg: any) => ({
          ...msg,
          isUnread:
            Array.isArray(msg.labelIds) && msg.labelIds.includes("UNREAD"),
          isStarred:
            Array.isArray(msg.labelIds) && msg.labelIds.includes("STARRED"),
        }));

        if (pageToken) {
          // Append to existing mails with deduplication
          setMails((prev) => {
            const existingIds = new Set(prev.map(m => m.id));
            const newMails = fetched.filter((m: any) => !existingIds.has(m.id));
            return [...prev, ...newMails];
          });
        } else {
          // Replace mails (also deduplicate in case backend sends duplicates)
          const uniqueMails = fetched.reduce((acc: any[], mail: any) => {
            if (!acc.find(m => m.id === mail.id)) {
              acc.push(mail);
            }
            return acc;
          }, []);
          setMails(uniqueMails);
        }

        setNextPageToken(data.nextPageToken || null);
        setHasMore(!!data.nextPageToken);
      } catch (err: any) {
        setError("Unable to load emails. Please try again.");
        console.error("Error fetching mails:", err);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [isAuthenticated, folderId, isAuthLoading, accessToken, sortBy, filterUnread, filterAttachment]
  );

  // Search mails
  const searchMails = useCallback(
    async (query: string) => {
      if (!isAuthenticated || !query) return;

      setError(null);
      setIsLoading(true);

      try {
        const token =
          typeof window !== "undefined" ? window.__accessToken : null;
        if (!token) return;

        const apiURL =
          process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
        const response = await fetch(
          `${apiURL}/search/fuzzy?q=${encodeURIComponent(query)}&limit=50`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) throw new Error("Search failed");

        const data = await response.json();
        const results = data?.data?.hits || [];

        // Transform search results to Mail format
        const transformedResults: Mail[] = results.map((hit: any) => ({
          id: hit.emailId,
          threadId: hit.threadId,
          from: hit.from,
          subject: hit.subject,
          snippet: hit.snippet,
          date: hit.receivedDate,
          isUnread: Array.isArray(hit.labelIds)
            ? hit.labelIds.includes("UNREAD")
            : false,
          isStarred: Array.isArray(hit.labelIds)
            ? hit.labelIds.includes("STARRED")
            : false,
          labelIds: Array.isArray(hit.labelIds)
            ? hit.labelIds
            : hit.status
              ? [hit.status]
              : [],
        }));

        setMails(transformedResults);
        setHasMore(false);
        setNextPageToken(null);
      } catch (err: any) {
        setError("Search failed. Please try again.");
        setMails([]);
      } finally {
        setIsLoading(false);
      }
    },
    [isAuthenticated]
  );

  // Load more mails (pagination)
  const loadMoreMails = useCallback(async () => {
    if (!hasMore || isLoadingMore || !nextPageToken || searchQuery) return;

    setIsLoadingMore(true);
    await fetchMails(nextPageToken);
  }, [hasMore, isLoadingMore, nextPageToken, searchQuery, fetchMails]);

  // Refresh mails (reload from start)
  const refreshMails = useCallback(async () => {
    setNextPageToken(null);
    setHasMore(true);
    await fetchMails();
  }, [fetchMails]);

  // Remove mail by ID from local state
  const removeMailById = useCallback((mailId: string) => {
    setMails((prev) => prev.filter((m) => m.id !== mailId));
  }, []);

  // Update mail by ID in local state
  const updateMailById = useCallback((mailId: string, updates: Partial<Mail>) => {
    setMails((prev) =>
      prev.map((m) => (m.id === mailId ? { ...m, ...updates } : m))
    );
  }, []);

  // Effect: Fetch mails when folder changes or on mount
  useEffect(() => {
    console.log('[useMailFolder] Main effect:', { folderId, searchQuery, isAuthenticated, isAuthLoading });
    if (isAuthLoading) {
      console.log('[useMailFolder] Waiting for auth to complete...');
      return;
    }
    if (!isAuthenticated) {
      console.log('[useMailFolder] Not authenticated, skipping fetch');
      return;
    }

    // Skip fetching when a label slug is being resolved to avoid transient loading flashes.
    if (folderId === "RESOLVING_LABEL") {
      console.log('[useMailFolder] Effect: skipping fetch while resolving label slug');
      setIsLoading(false);
      return;
    }

    // Surface not-found state immediately without attempting fetch.
    if (folderId === "NOT_FOUND_LABEL") {
      console.log('[useMailFolder] Effect: folder not found sentinel');
      setError("Folder not found");
      setIsLoading(false);
      setMails([]);
      setHasMore(false);
      setNextPageToken(null);
      return;
    }

    if (searchQuery) {
      searchMails(searchQuery);
    } else {
      fetchMails();
    }
  }, [folderId, searchQuery, isAuthenticated, isAuthLoading, sortBy, filterUnread, filterAttachment]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    mails,
    isLoading,
    error,
    nextPageToken,
    hasMore,
    isLoadingMore,
    loadMoreMails,
    refreshMails,
    removeMailById,
    updateMailById,
  };
}
