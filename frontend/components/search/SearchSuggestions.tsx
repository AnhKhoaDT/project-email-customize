"use client";

import { FaUserAlt, FaEnvelope } from "react-icons/fa";

interface SearchSuggestionsProps {
  suggestions: Array<{ value: string; type: 'sender' | 'subject' }>;
  selectedIndex: number;
  onSelect: (suggestion: string) => void;
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
          <div className="max-h-[300px] overflow-y-auto">
            {suggestions.map((suggestion, index) => {
              const isSelected = selectedIndex === index;
              const Icon = suggestion.type === 'sender' ? FaUserAlt : FaEnvelope;
              
              return (
                <button
                  key={`${suggestion.type}-${index}`}
                  onMouseDown={(e) => {
                    // Use onMouseDown instead of onClick to prevent input blur
                    e.preventDefault();
                    onSelect(suggestion.value);
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
                  <Icon 
                    className={`text-sm flex-shrink-0 ${
                      isSelected ? 'text-primary' : 'text-muted-foreground'
                    }`} 
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{suggestion.value}</div>
                    <div className="text-xs text-muted-foreground">
                      {suggestion.type === 'sender' ? 'From' : 'Subject'}
                    </div>
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
