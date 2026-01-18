import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { type Mail } from "@/types";

interface UseMailFolderOptions {
  folderId: string;
  searchQuery?: string | null;
  enabled?: boolean;
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
}

export function useMailFolder({
  folderId,
  searchQuery,
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

        // Build URL with pagination
        let url = `${apiURL}/mailboxes/${folderId}/emails?limit=${limit}`;
        if (pageToken) {
          url += `&pageToken=${pageToken}`;
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
        const rawMessages = Array.isArray(data?.messages)
          ? data.messages
          : Array.isArray(data)
            ? data
            : [];

        // Transform messages to ensure isUnread is properly set from labelIds
        const fetched = rawMessages.map((msg: any) => ({
          ...msg,
          isUnread:
            Array.isArray(msg.labelIds) && msg.labelIds.includes("UNREAD"),
          isStarred:
            Array.isArray(msg.labelIds) && msg.labelIds.includes("STARRED"),
        }));

        if (pageToken) {
          // Append to existing mails
          setMails((prev) => [...prev, ...fetched]);
        } else {
          // Replace mails
          setMails(fetched);
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
    [isAuthenticated, folderId, isAuthLoading, accessToken]
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
  }, [folderId, searchQuery, isAuthenticated, isAuthLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    mails,
    isLoading,
    error,
    nextPageToken,
    hasMore,
    isLoadingMore,
    loadMoreMails,
    refreshMails,
  };
}
