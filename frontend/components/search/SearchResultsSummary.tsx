"use client";

import { TbSparkles, TbSearch } from "react-icons/tb";

interface SearchResultsSummaryProps {
  totalResults: number;
  query: string;
  searchMode: "fuzzy" | "semantic";
  processingTime?: number;
}

/**
 * SearchResultsSummary Component
 * Displays search metadata and statistics
 */
export default function SearchResultsSummary({
  totalResults,
  query,
  searchMode,
  processingTime,
}: SearchResultsSummaryProps) {
  return (
    <div className="px-5 py-3 bg-blue-50 dark:bg-blue-950/20 border-b border-blue-200 dark:border-blue-900/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {searchMode === "semantic" ? (
            <TbSparkles className="text-purple-600 dark:text-purple-400" size={16} />
          ) : (
            <TbSearch className="text-blue-600 dark:text-blue-400" size={16} />
          )}
          <span className="text-gray-700 dark:text-gray-300">
            Found <strong>{totalResults}</strong> result{totalResults !== 1 ? "s" : ""} for{" "}
            <strong>"{query}"</strong>
          </span>
        </div>
        
        {processingTime !== undefined && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {processingTime}ms
          </span>
        )}
      </div>
      
      {searchMode === "semantic" && totalResults === 0 && (
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          💡 Tip: Make sure emails are indexed first by clicking "Index Emails for AI Search" above.
        </div>
      )}
    </div>
  );
}
