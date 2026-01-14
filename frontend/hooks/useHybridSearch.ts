import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Hybrid Search Types
 */
export interface EmailTopHit {
  type: 'email';
  emailId: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: Date;
  score: number;
}

export interface KeywordSuggestion {
  type: 'keyword';
  value: string;
  emailCount: number;
  category?: string;
  sampleEmailId?: string;
}

export interface HybridSuggestionsResponse {
  topHits: EmailTopHit[];
  keywords: KeywordSuggestion[];
  totalResults: number;
  processingTimeMs: number;
}

/**
 * Hybrid Search Hook
 * 
 * Features:
 * - Auto-fetch suggestions as user types (debounced)
 * - Dual click handlers: Top Hits → Navigate, Keywords → Search
 * - Keyboard navigation support
 * - Loading states
 * 
 * @param debounceMs - Debounce delay for auto-fetch (default: 150ms)
 */
export function useHybridSearch(debounceMs: number = 150) {
  const router = useRouter();
  
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<HybridSuggestionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Fetch hybrid suggestions from API
   */
  const fetchSuggestions = useCallback(async (prefix: string) => {
    if (!prefix || prefix.trim().length < 2) {
      setSuggestions(null);
      setShowDropdown(false);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/search/hybrid-suggestions?prefix=${encodeURIComponent(prefix)}&limitTopHits=2&limitKeywords=4`,
        { signal: controller.signal }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch suggestions');
      }

      const result = await response.json();
      
      if (result.status === 200) {
        setSuggestions(result.data);
        setShowDropdown(true);
      } else {
        throw new Error(result.message || 'Failed to fetch suggestions');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Ignore aborted requests
        return;
      }
      console.error('[HybridSearch] Fetch error:', err);
      setError(err.message);
      setSuggestions(null);
      setShowDropdown(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Handle query change with debouncing
   */
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce fetch
    if (value.trim().length >= 2) {
      debounceTimerRef.current = setTimeout(() => {
        fetchSuggestions(value);
      }, debounceMs);
    } else {
      setSuggestions(null);
      setShowDropdown(false);
    }
  }, [debounceMs, fetchSuggestions]);

  /**
   * Handle Top Hit click → Navigate to email detail
   */
  const handleTopHitClick = useCallback((topHit: EmailTopHit) => {
    console.log('[HybridSearch] Top Hit clicked:', topHit.subject);
    
    // Navigate to email detail page
    router.push(`/inbox?emailId=${topHit.emailId}&threadId=${topHit.threadId}`);
    
    // Clear dropdown
    setShowDropdown(false);
    setQuery('');
    setSuggestions(null);
  }, [router]);

  /**
   * Handle Keyword click → Trigger semantic search
   */
  const handleKeywordClick = useCallback((keyword: KeywordSuggestion) => {
    console.log('[HybridSearch] Keyword clicked:', keyword.value);
    
    // Fill search box with keyword
    setQuery(keyword.value);
    
    // Trigger semantic search with mode=semantic
    router.push(`/inbox?q=${encodeURIComponent(keyword.value)}&mode=semantic`);
    
    // Clear dropdown
    setShowDropdown(false);
  }, [router]);

  /**
   * Clear search
   */
  const clearSearch = useCallback(() => {
    setQuery('');
    setSuggestions(null);
    setShowDropdown(false);
    setError(null);
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    query,
    setQuery: handleQueryChange,
    suggestions,
    isLoading,
    error,
    showDropdown,
    setShowDropdown,
    handleTopHitClick,
    handleKeywordClick,
    clearSearch,
  };
}
