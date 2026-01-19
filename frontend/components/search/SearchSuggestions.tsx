"use client";

import { useEffect, useRef } from "react";
import { FaUserAlt, FaEnvelope } from "react-icons/fa";

interface SearchSuggestionsProps {
  suggestions: Array<{ value: string; type: 'sender' | 'subject'; from?: string }>;
  selectedIndex: number;
  onSelect: (suggestion: string, type: 'sender' | 'subject') => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function SearchSuggestions({
  suggestions,
  selectedIndex,
  onSelect,
  isLoading = false,
  error = null,
}: SearchSuggestionsProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selectedIndex == null || selectedIndex < 0) return;
    const root = listRef.current;
    if (!root) return;

    // Try to find element by display index first, then by original index
    const selector = `[data-display-index=\"${selectedIndex}\"],[data-original-index=\"${selectedIndex}\"]`;
    const el = root.querySelector(selector) as HTMLElement | null;
    if (el) {
      // scroll the selected item into view inside the container
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);
  // Always show dropdown when called (even if loading or has suggestions)
  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-secondary/50 rounded-md shadow-xl z-50 overflow-hidden backdrop-blur-sm">
      {error ? (
        // Error state
        <div className="p-4">
          <div className="flex items-center gap-3 text-sm text-destructive">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      ) : isLoading && suggestions.length === 0 ? (
        // Loading state
        <div className="p-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
            <span>Searching...</span>
          </div>
        </div>
      ) : suggestions.length === 0 ? (
        // No results
        <div className="p-4">
          <div className="text-sm text-muted-foreground">
            No suggestions found
          </div>
        </div>
      ) : (
        // Suggestions list
        <>
          <div className="max-h-[300px] overflow-y-auto" ref={listRef}>
            {/* Separate suggestions by type */}
            {(() => {
              const contacts = suggestions.filter(s => s.type === 'sender');
              const keywords = suggestions.filter(s => s.type === 'subject');
              
              const displayList = [...keywords, ...contacts];

              return (
                <>
                  {/* Keywords Section */}
                  {keywords.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-secondary/10">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          🔍 Keywords
                        </span>
                      </div>
                      {keywords.map((suggestion, idx) => {
                        const displayIndex = displayList.findIndex(s => s === suggestion);
                        const originalIndex = suggestions.findIndex(s => s === suggestion);
                        const isSelected = selectedIndex === displayIndex || selectedIndex === originalIndex;
                        
                        return (
                          <button
                            key={`subject-${idx}`}
                            data-display-index={displayIndex}
                            data-original-index={originalIndex}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              onSelect(suggestion.value, suggestion.type);
                            }}
                            className={`
                              w-full px-4 py-2.5 text-left flex items-center gap-3 transition-all
                              border-l-2
                              ${isSelected 
                                ? 'bg-primary/10 border-primary text-foreground' 
                                : 'border-transparent hover:bg-secondary/40 text-foreground hover:border-secondary'
                              }
                            `}
                          >
                            <FaEnvelope 
                              className={`text-sm shrink-0 ${
                                isSelected ? 'text-primary' : 'text-muted-foreground'
                              }`} 
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{suggestion.value}</div>
                              <div className="text-xs text-muted-foreground">Topic</div>
                            </div>
                            {isSelected && (
                              <kbd className="hidden sm:inline-block px-2 py-0.5 text-xs font-mono border border-primary/30 rounded bg-primary/5">
                                ↵
                              </kbd>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                                    {/* Contacts Section */}
                  {contacts.length > 0 && (
                    <div className="border-b border-secondary/30">
                      <div className="px-4 py-2 bg-secondary/10">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          👤 Contacts
                        </span>
                      </div>
                      {contacts.map((suggestion, idx) => {
                        const displayIndex = displayList.findIndex(s => s === suggestion);
                        const originalIndex = suggestions.findIndex(s => s === suggestion);
                        const isSelected = selectedIndex === displayIndex || selectedIndex === originalIndex;
                        
                        return (
                          <button
                            key={`sender-${idx}`}
                            data-display-index={displayIndex}
                            data-original-index={originalIndex}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              onSelect(suggestion.from ?? suggestion.value, suggestion.type);
                            }}
                            className={`
                              w-full px-4 py-2.5 text-left flex items-center gap-3 transition-all
                              border-l-2
                              ${isSelected 
                                ? 'bg-primary/10 border-primary text-foreground' 
                                : 'border-transparent hover:bg-secondary/40 text-foreground hover:border-secondary'
                              }
                            `}
                          >
                            <FaUserAlt 
                              className={`text-sm shrink-0 ${
                                isSelected ? 'text-primary' : 'text-muted-foreground'
                              }`} 
                            />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{suggestion.value}</div>
                                <div className="text-xs text-muted-foreground truncate" title={suggestion.from ?? suggestion.value}>{suggestion.from ?? suggestion.value}</div>
                            </div>
                            {isSelected && (
                              <kbd className="hidden sm:inline-block px-2 py-0.5 text-xs font-mono border border-primary/30 rounded bg-primary/5">
                                ↵
                              </kbd>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          {isLoading && (
            <div className="px-4 py-2 text-xs text-muted-foreground bg-secondary/10 border-t border-secondary/30 flex items-center gap-2">
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary border-t-transparent"></div>
              <span>Updating...</span>
            </div>
          )}
          <div className="px-4 py-2 text-xs text-muted-foreground bg-secondary/10 border-t border-secondary/30">
            <span className="hidden sm:inline">Use ↑↓ to navigate • </span>
            <span className="hidden sm:inline">Enter to select • </span>
            <span>Esc to close</span>
          </div>
        </>
      )}
    </div>
  );
}
