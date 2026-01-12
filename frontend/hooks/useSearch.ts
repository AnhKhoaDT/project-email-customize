"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type SearchMode } from "@/components/search/SearchModeDropdown";
import { type Mail } from "@/types";

interface UseSearchOptions {
  folderSlug: string;
  isAuthenticated: boolean;
  onMailsChange?: (mails: Mail[]) => void; // Optional for pages that don't use search for mails
  onErrorChange: (error: string | null) => void;
  onLoadingChange: (loading: boolean) => void;
}

interface UseSearchReturn {
  searchMode: SearchMode;
  setSearchMode: (mode: SearchMode) => void;
  isSearching: boolean;
  error: string | null;
  handleSearch: (query: string, isSuggestion?: boolean) => void;
  onClearSearch: () => void;
}

export const useSearch = ({
  folderSlug,
  isAuthenticated,
  onMailsChange,
  onErrorChange,
  onLoadingChange,
}: UseSearchOptions): UseSearchReturn => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('q');

  // Search state
  const [searchMode, setSearchMode] = useState<SearchMode>("fuzzy");
  const [isSearching, setIsSearching] = useState(false);
  const [lastSearchQuery, setLastSearchQuery] = useState<string | null>(null);
  const [lastSearchMode, setLastSearchMode] = useState<SearchMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Update parent error state
  useEffect(() => {
    onErrorChange(error);
  }, [error, onErrorChange]);

  // Update parent loading state
  useEffect(() => {
    onLoadingChange(isSearching);
  }, [isSearching, onLoadingChange]);

  // Search handler - just updates URL, useEffect handles actual search
  const handleSearch = useCallback((query: string, isSuggestion: boolean = false) => {
    if (!query.trim()) return;

    // Force semantic search when triggered from suggestion (per requirement)
    if (isSuggestion && searchMode !== 'semantic') {
      setSearchMode('semantic');
    }

    router.push(`/${folderSlug}?q=${encodeURIComponent(query)}`);
  }, [router, folderSlug, searchMode]);

  // Clear search
  const onClearSearch = useCallback(() => {
    router.push(`/${folderSlug}`);
  }, [router, folderSlug]);

  // Auto-search when URL has query param (only if different from last search OR mode changed)
  useEffect(() => {
    console.log('[useSearch] Effect triggered:', { isAuthenticated, searchQuery, searchMode, lastSearchQuery, lastSearchMode });

    if (!isAuthenticated || !searchQuery) {
      console.log('[useSearch] Skipping: not authenticated or no query');
      return;
    }

    // Skip if same query AND same mode (prevent duplicate search)
    if (searchQuery === lastSearchQuery && searchMode === lastSearchMode) {
      console.log('[useSearch] Skipping: same query and mode');
      return;
    }

    // Mark this query and mode as "attempted" immediately to prevent infinite loop
    setLastSearchQuery(searchQuery);
    setLastSearchMode(searchMode);

    const performSearch = async () => {
      try {
        console.log('[useSearch] Starting search:', { searchQuery, searchMode });
        setIsSearching(true);
        setError(null);

        const token =
          process.env.NODE_ENV === "development"
            ? window.__accessToken
            : window.__accessToken;
        if (!token) {
          console.log('[useSearch] No token found');
          return;
        }

        const apiURL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";

        let response;

        // Choose search endpoint based on mode
        if (searchMode === "semantic") {
          // Semantic Search
          console.log('[useSearch] Calling semantic search API');
          response = await fetch(`${apiURL}/search/semantic`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              query: searchQuery,
              limit: 50,
              threshold: 0.5,
            }),
          });
        } else {
          // Fuzzy Search (default)
          console.log('[useSearch] Calling fuzzy search API');
          response = await fetch(
            `${apiURL}/search/fuzzy?q=${encodeURIComponent(searchQuery)}&limit=50`,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            }
          );
        }

        if (!response.ok) throw new Error("Search failed");

        const data = await response.json();
        console.log('[useSearch] API response:', data);

        // Handle different response formats
        let results = [];
        if (searchMode === "semantic") {
          results = data?.data?.results || [];
        } else {
          results = data?.data?.hits || [];
        }

        console.log('[useSearch] Results count:', results.length);

        // Transform search results to Mail format
        const transformedResults: Mail[] = results.map((hit: any) => ({
          id: hit.emailId || hit.id,
          threadId: hit.threadId,
          from: hit.from,
          subject: hit.subject,
          snippet: hit.snippet,
          date: hit.receivedDate || hit.date,
          isUnread: false,
          isStarred: false,
          labelIds: hit.status ? [hit.status] : [],
          // Add similarity score for semantic search
          similarityScore: hit.similarityScore,
        }));

        console.log('[useSearch] Calling onMailsChange with results:', transformedResults.length);
        onMailsChange?.(transformedResults);
      } catch (err: any) {
        console.error('[useSearch] Search error:', err);
        setError("Search failed. Please try again.");
        onMailsChange?.([]);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, searchQuery, searchMode]);

  return {
    searchMode,
    setSearchMode,
    isSearching,
    error,
    handleSearch,
    onClearSearch,
  };
};
