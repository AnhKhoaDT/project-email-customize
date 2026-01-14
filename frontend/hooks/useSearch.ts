"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type SearchMode } from "@/components/search/SearchModeDropdown";
import { type Mail } from "@/types";

interface UseSearchOptions {
  folderSlug: string;
  isAuthenticated: boolean;
  isAuthInitialized: boolean;  // 🔒 New: ensures auth check is complete
  accessToken: string | null;
  onMailsChange?: (mails: Mail[]) => void; // Optional for pages that don't use search for mails
  onErrorChange: (error: string | null) => void;
  onLoadingChange: (loading: boolean) => void;
  onRefreshMails?: () => void; // Callback to refresh mails after clearing search
}

interface UseSearchReturn {
  searchMode: SearchMode;
  setSearchMode: (mode: SearchMode) => void;
  isSearching: boolean;
  error: string | null;
  handleSearch: (query: string, isSuggestion?: boolean, suggestionType?: 'sender' | 'subject') => void;
  onClearSearch: () => void;
}

export const useSearch = ({
  folderSlug,
  isAuthenticated,
  isAuthInitialized,
  accessToken,
  onMailsChange,
  onErrorChange,
  onLoadingChange,
  onRefreshMails,
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
    console.log('[useSearch] Loading state changed:', isSearching);
    onLoadingChange(isSearching);
  }, [isSearching, onLoadingChange]);

  // Search handler - just updates URL, useEffect handles actual search
  const handleSearch = useCallback((query: string, isSuggestion: boolean = false, suggestionType?: 'sender' | 'subject') => {
    if (!query.trim()) return;

    // Force semantic search when triggered from ANY suggestion (contact or keyword)
    if (isSuggestion) {
      // Both Contact & Keyword → Semantic AI Search
      setSearchMode('semantic');
      const newUrl = `/${folderSlug}?q=${encodeURIComponent(query)}&mode=semantic`;
      window.history.pushState(null, '', newUrl);
    } else {
      // Manual input → use current search mode
      const newUrl = `/${folderSlug}?q=${encodeURIComponent(query)}`;
      window.history.pushState(null, '', newUrl);
    }
    
    // Manually trigger search since we bypassed router
    setLastSearchQuery(''); // Force re-search by clearing last query
  }, [folderSlug, setLastSearchQuery]);

  // Clear search
  const onClearSearch = useCallback(() => {
    // Clear search state first
    onErrorChange(null);
    setError(null);
    setIsSearching(false);
    setLastSearchQuery(null);
    setLastSearchMode(null);
    
    // Update URL and trigger popstate event to notify Next.js
    window.history.pushState(null, '', `/${folderSlug}`);
    
    // Dispatch custom event to trigger re-render
    window.dispatchEvent(new PopStateEvent('popstate'));
    
    // Manually trigger refresh to reload inbox mails immediately
    // This ensures mails are loaded even if URL update is async
    if (onRefreshMails) {
      onRefreshMails();
    }
  }, [folderSlug, onErrorChange, onRefreshMails]);

  // Auto-search when URL has query param (only if different from last search OR mode changed)
  useEffect(() => {
    console.log('[useSearch] Effect triggered:', { isAuthInitialized, isAuthenticated, searchQuery, searchMode, lastSearchQuery, lastSearchMode });

    if (!searchQuery) {
      console.log('[useSearch] Skipping: no query');
      setIsSearching(false);
      return;
    }

    if (!isAuthInitialized) {
      console.log('[useSearch] Skipping: auth not initialized yet');
      // Don't set isSearching to false here - waiting for auth
      return;
    }

    if (!isAuthenticated) {
      console.log('[useSearch] Skipping: not authenticated');
      setIsSearching(false);
      setError('Please login to search');
      return;
    }

    // Check URL params for forced mode (from suggestion)
    const urlParams = new URLSearchParams(window.location.search);
    const forcedMode = urlParams.get('mode');
    const effectiveMode = forcedMode === 'semantic' ? 'semantic' : forcedMode === 'fuzzy' ? 'fuzzy' : searchMode;

    // Skip if same query AND same mode (prevent duplicate search)
    if (searchQuery === lastSearchQuery && effectiveMode === lastSearchMode) {
      console.log('[useSearch] Skipping: same query and mode');
      setIsSearching(false);
      return;
    }

    // Mark this query and mode as "attempted" immediately to prevent infinite loop
    setLastSearchQuery(searchQuery);
    setLastSearchMode(effectiveMode);

    const performSearch = async () => {
      try {
        console.log('[useSearch] Starting search:', { searchQuery, effectiveMode });
        setIsSearching(true);
        setError(null);

        const token = accessToken || (typeof window !== "undefined" ? window.__accessToken : null);
        if (!token) {
          console.log('[useSearch] No token found');
          setError('Authentication required');
          setIsSearching(false);
          return;
        }

        const apiURL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";

        let response;

        // Choose search endpoint based on mode
        if (effectiveMode === "semantic") {
          // Semantic Search
          console.log('[useSearch] Calling semantic search API (from suggestion or toggle)');
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
          
          const fuzzyUrl = `${apiURL}/search/fuzzy?q=${encodeURIComponent(searchQuery)}&limit=50`;
          
          response = await fetch(fuzzyUrl, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          });
        }

        if (!response.ok) throw new Error("Search failed");

        const data = await response.json();
        console.log('[useSearch] API response:', data);

        // Handle different response formats
        let results = [];
        if (effectiveMode === "semantic") {
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
        console.log('[useSearch] Setting isSearching to false');
        setIsSearching(false);
      }
    };

    performSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthInitialized, isAuthenticated, searchQuery, searchMode, accessToken]);

  return {
    searchMode,
    setSearchMode,
    isSearching,
    error,
    handleSearch,
    onClearSearch,
  };
};
