import { TbLayoutSidebarRightExpandFilled, TbSparkles } from "react-icons/tb";
// ... import khác giữ nguyên ...
import { BsFillLightningChargeFill } from "react-icons/bs";
import { FaSearch, FaUserAlt, FaBell, FaTag } from "react-icons/fa";
import { LuSquareKanban } from "react-icons/lu";
import { IoMdRefresh } from "react-icons/io";

import { IoWarning } from "react-icons/io5";
import { Mail } from "@/types";
import { EmailData } from "@/types";
import { useEffect, useRef, useState, KeyboardEvent, useCallback } from "react";
import SearchModeDropdown, {
  type SearchMode,
} from "@/components/search/SearchModeDropdown";
import SearchSuggestions from "@/components/search/SearchSuggestions";
import { getHybridSuggestions } from "@/lib/api";

interface MailBoxProps {
  toggleSidebar: () => void;
  selectedMail?: EmailData | null;
  mails: Mail[];
  onSelectMail: (mail: Mail) => void;
  focusedIndex?: number;
  isLoadingMore?: boolean;
  isLoading?: boolean; // Loading state for mail list refresh
  hasMore?: boolean;
  kanbanMode: boolean;
  kanbanClick: () => void;
  onRefresh?: () => void; // Reload emails
  // Search props
  searchQuery?: string;
  onSearch?: (query: string, isSuggestion?: boolean, suggestionType?: 'sender' | 'subject') => void;
  onClearSearch?: () => void;
  isSearching?: boolean;
  error?: string | null;
  // Search mode
  searchMode?: SearchMode;
  onSearchModeChange?: (mode: SearchMode) => void;
  // Folder name
  folderName?: string;
  onFocusedIndexChange?: (index: number) => void;
}

const MailBox = ({
  toggleSidebar,
  selectedMail,
  mails,
  onSelectMail,
  focusedIndex = 0,
  isLoadingMore = false,
  isLoading = false,
  hasMore = true,
  kanbanMode = false,
  kanbanClick,
  onRefresh,
  searchQuery,
  onSearch,
  onClearSearch,
  isSearching = false,
  error = null,
  searchMode = "fuzzy",
  onSearchModeChange,
  folderName = "Inbox",
  onFocusedIndexChange,
}: MailBoxProps) => {
  // Ref to track focused mail item for scroll-into-view
  const focusedItemRef = useRef<HTMLDivElement | null>(null);

  // Local state for search input (to prevent parent re-renders on every keystroke)
  const [inputValue, setInputValue] = useState(searchQuery || "");

  // Auto-suggest state
  const [suggestions, setSuggestions] = useState<
    Array<{ value: string; type: "sender" | "subject" }>
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isFocusedRef = useRef(false); // Track focus state to avoid stale closures

  // Update local input when searchQuery prop changes (e.g., from URL)
  useEffect(() => {
    setInputValue(searchQuery || "");
  }, [searchQuery]);

  // Sync isFocusedRef with isFocused state
  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);

  // Fetch suggestions with debounce
  const fetchSuggestions = useCallback(
    async (value: string, signal?: AbortSignal) => {
      if (value.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        setIsLoadingSuggestions(false);
        setSuggestionsError(null);
        return;
      }

      // Keep showing previous suggestions while loading
      setIsLoadingSuggestions(true);
      setSuggestionsError(null);

      try {
        // 🚀 Use NEW Hybrid API (Atlas Search - <200ms)
        // Increased limits: 3 top hits + 8 keywords = min 3, up to 11 suggestions
        const result = await getHybridSuggestions(value, 3, 8);

        // Check if request was aborted
        if (signal?.aborted) {
          console.log("[Suggestions] Request aborted for:", value);
          return;
        }

        // Convert hybrid format to old format for backward compatibility
        const convertedSuggestions: Array<{ value: string; type: 'sender' | 'subject' }> = [
          // Top Hits (emails) → map to 'sender' type for navigation
          ...result.topHits.map(hit => ({
            value: hit.subject,
            type: 'sender' as const // Will trigger navigation
          })),
          // Keywords → map to 'subject' type for semantic search
          ...result.keywords.map(keyword => ({
            value: keyword.value,
            type: 'subject' as const // Will trigger semantic search
          }))
        ];

        // Double check if request was aborted before updating state
        if (signal?.aborted) {
          console.log("[Suggestions] Request aborted before state update");
          return;
        }

        setSuggestions(convertedSuggestions);
        setSuggestionsError(null);
        // Only show dropdown if input is still focused AND not aborted
        // Use ref to get latest focus state (avoid stale closure)
        if (isFocusedRef.current && !signal?.aborted) {
          setShowSuggestions(true);
        }
        setSelectedSuggestionIndex(-1);
        setIsLoadingSuggestions(false);
      } catch (error) {
        // Ignore abort errors
        if (signal?.aborted || (error as any)?.name === "AbortError") {
          console.log("[Suggestions] Request cancelled");
          return;
        }

        console.error("[Suggestions] Failed:", error);
        setSuggestions([]);
        setSuggestionsError(
          error instanceof Error ? error.message : "Failed to load suggestions"
        );
        // Only show error dropdown if input is still focused
        // Use ref to get latest focus state (avoid stale closure)
        if (isFocusedRef.current && !signal?.aborted) {
          setShowSuggestions(true);
        }
        setIsLoadingSuggestions(false);
      }
    },
    [] // isFocusedRef is used instead of isFocused to avoid stale closures
  );

  // Debounced input handler
  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);

      // If empty, hide immediately
      if (value.length === 0) {
        setSuggestions([]);
        setShowSuggestions(false);
        setIsLoadingSuggestions(false);
        setSuggestionsError(null);
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        // Cancel pending request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        return;
      }

      // Show dropdown and loading state immediately for better UX (when >= 2 chars)
      if (value.length >= 2 && isFocusedRef.current) {
        setShowSuggestions(true);
        setIsLoadingSuggestions(true);
        setSuggestionsError(null);
      }

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Set new timer for debounced fetch
      debounceTimerRef.current = setTimeout(() => {
        // Create new AbortController for this request
        abortControllerRef.current = new AbortController();
        fetchSuggestions(value, abortControllerRef.current.signal);
      }, 500); // Increased to 500ms for better debouncing
    },
    [fetchSuggestions, isFocused]
  );

  // Cleanup debounce timer and abort controller
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

  // Scroll focused item into view when focusedIndex changes
  useEffect(() => {
    if (focusedItemRef.current) {
      focusedItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [focusedIndex]);

  // Note: global keyboard handling is provided by `useKeyboardNavigation` at page level.

  // Handle search on Enter key with keyboard navigation
  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Arrow Down: Navigate suggestions
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        setSelectedSuggestionIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
      }
    }
    // Arrow Up: Navigate suggestions
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : -1));
      }
    }
    // Enter: Select suggestion or search
    else if (e.key === "Enter") {
      e.preventDefault();

      if (
        showSuggestions &&
        selectedSuggestionIndex >= 0 &&
        suggestions[selectedSuggestionIndex]
      ) {
        // Use selected suggestion → Contact or Keyword logic
        const selected = suggestions[selectedSuggestionIndex];
        setInputValue(selected.value);
        onSearch?.(selected.value, true, selected.type); // Pass type
        setShowSuggestions(false);
        setSuggestions([]);
      } else if (inputValue.trim()) {
        // Use typed value → use current search mode
        onSearch?.(inputValue.trim(), false); // false = manual input
        setShowSuggestions(false);
        setSuggestions([]);
      }
    }
    // Escape: Close suggestions or clear search
    else if (e.key === "Escape") {
      if (showSuggestions) {
        setShowSuggestions(false);
        setSuggestions([]);
      } else {
        handleClearSearch();
      }
    }
  };

  // Handle clear search
  const handleClearSearch = () => {
    setInputValue("");
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    onClearSearch?.();
  };

  // Handle suggestion selection
  // Contact → Exact filter, Keyword → Semantic search (per requirement)
  const handleSelectSuggestion = useCallback(
    (suggestionValue: string, suggestionType: 'sender' | 'subject') => {
      setInputValue(suggestionValue);
      onSearch?.(suggestionValue, true, suggestionType); // Pass type
      setShowSuggestions(false);
      setSuggestions([]);
      setSelectedSuggestionIndex(-1);
    },
    [onSearch]
  );

  // UPDATE 1: Đổi w-1/3 thành w-full.
  // Parent (Home) sẽ bọc component này trong một thẻ div có width responsive.
  return (
    <div className="mailbox-scroll-container flex flex-col w- bg-background border-x border-amber-50/50 h-full overflow-hidden">
      {/* ... (Phần Header, Search, Filter Buttons giữ nguyên) ... */}
      <div className="flex flex-col justify-between p-5 sticky top-0 bg-background z-10">
        <div className="flex flex-row justify-between items-center">
          <div className="flex flex-row items-center gap-2">
            <button
              onClick={toggleSidebar}
              className="flex justify-center items-center h-8 w-8 hover:bg-secondary/10 rounded-md transition-colors cursor-pointer"
            >
              <TbLayoutSidebarRightExpandFilled size={20} className="" />
            </button>
            <h1 className="text-base font-semibold">
              {searchQuery ? `Search: "${searchQuery}"` : folderName}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Refresh Button */}
            {onRefresh && !searchQuery && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="flex justify-center items-center h-8 w-8 hover:bg-secondary/10 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Reload emails"
              >
                <IoMdRefresh size={20} className={isLoading ? "animate-spin" : ""} />
              </button>
            )}
            {/* kanban active/ unactive*/}
            <button
              onClick={kanbanClick}
              className={`flex justify-center items-center h-8 w-8  rounded-md transition-colors cursor-pointer ${kanbanMode ? "bg-primary/40 " : "hover:bg-secondary/60"
                }`}
            >
              <LuSquareKanban size={20} />
            </button>
          </div>
        </div>
        {/* Search */}
        <div className="flex flex-col gap-2 mt-4">
          <div className="flex flex-row items-center justify-center gap-2 p-2 rounded-md bg-background/70 border border-secondary focus-within:ring-1 ring-primary transition-all">
            {/* Search Mode Dropdown */}
            {onSearchModeChange && (
              <SearchModeDropdown
                value={searchMode}
                onChange={onSearchModeChange}
                disabled={isSearching}
              />
            )}

            <div className="relative flex items-center gap-2 flex-1">
              {/* <FaSearch
                className={
                  isSearching ? "text-primary animate-pulse" : "text-gray-400"
                }
              /> */}
              <input
                type="text"
                placeholder="Search emails... (Press Enter)"
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => {
                  setIsFocused(true);
                  // Show dropdown if we have content (>= 2 chars)
                  if (inputValue.length >= 2) {
                    setShowSuggestions(true);
                    // Trigger fetch if no suggestions yet
                    if (suggestions.length === 0 && !isLoadingSuggestions) {
                      fetchSuggestions(inputValue);
                    }
                  }
                }}
                onBlur={() => {
                  setIsFocused(false);
                  // Delay to allow click on suggestion
                  setTimeout(() => {
                    // Only hide if still not focused (user might have refocused)
                    setShowSuggestions(false);
                    // Cancel any pending suggestions request
                    if (abortControllerRef.current) {
                      abortControllerRef.current.abort();
                      abortControllerRef.current = null;
                    }
                    setIsLoadingSuggestions(false);
                  }, 200);
                }}
                disabled={isSearching}
                className="w-full mailbox-search-input focus:outline-none placeholder-secondary bg-transparent disabled:opacity-50"
                autoComplete="off"
              />
              {(inputValue || searchQuery) && (
                <button
                  onClick={handleClearSearch}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="Clear search (Esc)"
                >
                  ✕
                </button>
              )}

              {/* Auto-suggest dropdown */}
              {(showSuggestions || isLoadingSuggestions) &&
                inputValue.length >= 2 && (
                  <SearchSuggestions
                    suggestions={suggestions}
                    selectedIndex={selectedSuggestionIndex}
                    onSelect={handleSelectSuggestion}
                    isLoading={isLoadingSuggestions}
                    error={suggestionsError}
                  />
                )}
            </div>
          </div>
        </div>
      </div>
      <div className="w-full bg-secondary h-px opacity-30"></div>

      <main className="flex-1 p-5 overflow-y-auto mailbox-scrollbar mailbox-scroll-target">
        {/* Mail List */}
        <div className="">
          <div className="flex flex-col gap-2">
            {/* Loading Indicator - Refreshing */}
            {isLoading && mails.length > 0 && !isSearching && (
              <div className="flex justify-center items-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span className="ml-2 text-sm text-secondary">
                  Refreshing...
                </span>
              </div>
            )}

            {/* Loading Indicator - Searching */}
            {isSearching && (
              <div className="flex justify-center items-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span className="ml-2 text-sm text-secondary">
                  Searching...
                </span>
              </div>
            )}
            
            {mails && mails.length > 0 ? (
              mails.map((mail, index) => {
                const isSelected = selectedMail?.id === mail.id;
                const isFocused = focusedIndex === index;
                const isUnread = !!mail.isUnread || (!!mail.labelIds && mail.labelIds.includes("UNREAD"));

                const bgClass = isSelected
                  ? "bg-primary/20 border-primary/30"
                  : isUnread
                  ? "bg-primary/5 border border-primary-100 hover:bg-primary/20 dark:bg-gray-800/50 dark:border-gray-700 dark:hover:bg-gray-800/70"
                  : "bg-white border border-gray-200 hover:bg-primary/20 dark:bg-background dark:border-gray-800 dark:hover:bg-gray-800/70";
                const focusClass = isFocused && !isSelected ? "ring-2 ring-primary/20" : "";

                return (
                  <div
                    key={mail.id}
                    ref={isFocused ? focusedItemRef : null}
                    onClick={() => onSelectMail(mail)}
                    draggable={true}
                    role="option"
                    aria-selected={isSelected || isFocused}
                    tabIndex={-1}
                    className={`flex flex-row justify-between items-start md:items-center p-3 rounded-md transition-all cursor-pointer border focus:outline-none ${bgClass} ${focusClass}`}
                  >
                    {/* ... (Nội dung từng item mail giữ nguyên) ... */}
                    <div className="flex items-start md:items-center w-full overflow-hidden">
                      {/* <img
                        src={
                          "https://avatar.iran.liara.run/username?username=" +
                          (mail.from || "someone")
                        }
                        alt="Avatar"
                        className="w-10 h-10 rounded-full mr-4 shrink-0 object-cover"
                      /> */}
                      {/* <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="#CCCCCC"
                        width="100px"
                        height="100px"
                        className="w-10 h-10 rounded-full mr-4 shrink-0 object-cover"
                      >
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg> */}
                      <div className="flex flex-col w-full min-w-0">
                        <div className="flex flex-row items-center justify-between">
                          <span
                            className={`mr-2 truncate text-secondary ${isSelected
                              ? "font-bold text-foreground"
                              : "font-semibold"
                              }`}
                          >
                            {mail.from || "someone"}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Similarity Score Badge */}
                            {mail.similarityScore !== undefined && (
                              <div
                                className={`
                                  flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                                  ${mail.similarityScore >= 0.7
                                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                    : mail.similarityScore >= 0.5
                                      ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                                  }
                                `}
                                title={`Similarity: ${(
                                  mail.similarityScore * 100
                                ).toFixed(0)}%`}
                              >
                                <TbSparkles size={12} />
                                <span>
                                  {(mail.similarityScore * 100).toFixed(0)}%
                                </span>
                              </div>
                            )}
                            <span className="text-secondary text-xs">
                              {mail.date}
                            </span>
                          </div>
                        </div>
                        <div className="w-full">
                          <p className="text-sm truncate text-secondary">
                            {mail.subject || "No subject"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex items-center justify-center h-full min-w-[370px]">
                {error ? (
                  <span className="text-red-600 dark:text-red-400">
                    {error}
                  </span>
                ) : (
                  <span className="text-secondary">No mails found.</span>
                )}
              </div>
            )}

            {/* Loading More Indicator */}
            {isLoadingMore && (
              <div className="flex justify-center items-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span className="ml-2 text-sm text-secondary">
                  Loading more...
                </span>
              </div>
            )}

            {/* End of List Indicator */}
            {!hasMore && mails.length > 0 && (
              <div className="text-center text-secondary text-xs py-4">
                No more emails to load
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default MailBox;
