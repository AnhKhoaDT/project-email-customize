import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { type Mail } from "@/types";

interface UseMailFolderOptions {
  folderId: string;
  searchQuery?: string | null;
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
  const { isAuthenticated } = useAuth();

  const [mails, setMails] = useState<Mail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Fetch mails for a specific folder
  const fetchMails = useCallback(
    async (pageToken?: string) => {
      if (!isAuthenticated) return;

      setError(null);

      try {
        if (!pageToken) {
          setIsLoading(true);
        }

        const token =
          typeof window !== "undefined" ? window.__accessToken : null;
        if (!token) {
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
    [isAuthenticated, folderId]
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
    if (searchQuery) {
      searchMails(searchQuery);
    } else {
      fetchMails();
    }
  }, [folderId, searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

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
