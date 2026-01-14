"use client";

import React from 'react';
import { EmailTopHit, KeywordSuggestion } from '@/hooks/useHybridSearch';

interface HybridSearchDropdownProps {
  topHits: EmailTopHit[];
  keywords: KeywordSuggestion[];
  onTopHitClick: (topHit: EmailTopHit) => void;
  onKeywordClick: (keyword: KeywordSuggestion) => void;
  isLoading: boolean;
  processingTimeMs?: number;
}

/**
 * Hybrid Search Dropdown Component
 * 
 * Displays:
 * 1. Top Hits: Direct email matches (📧 icon, navigate to email)
 * 2. Keywords: Topic suggestions (🔍 icon, trigger semantic search)
 * 
 * UX:
 * - Click Top Hit → Navigate to email detail
 * - Click Keyword → Fill search box + trigger semantic search
 * - Hover effect + visual separation
 */
export function HybridSearchDropdown({
  topHits,
  keywords,
  onTopHitClick,
  onKeywordClick,
  isLoading,
  processingTimeMs
}: HybridSearchDropdownProps) {
  const hasTopHits = topHits.length > 0;
  const hasKeywords = keywords.length > 0;
  const hasResults = hasTopHits || hasKeywords;

  if (isLoading) {
    return (
      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 p-4">
        <div className="flex items-center justify-center gap-2 text-gray-500">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Searching...</span>
        </div>
      </div>
    );
  }

  if (!hasResults) {
    return (
      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 p-4">
        <div className="text-center text-gray-500 text-sm">
          No results found
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
      {/* Top Hits Section */}
      {hasTopHits && (
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              📧 Top Hits (Navigate)
            </h3>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {topHits.map((hit, index) => (
              <button
                key={hit.emailId}
                onClick={() => onTopHitClick(hit)}
                className="w-full px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 text-left transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 font-medium text-sm">
                    {hit.from.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                        {hit.from}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {new Date(hit.date).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-300 font-medium mt-0.5 truncate">
                      {hit.subject}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                      {hit.snippet}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Keywords Section */}
      {hasKeywords && (
        <div>
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              🔍 Keywords (Semantic AI)
            </h3>
          </div>
          <div className="max-h-[180px] overflow-y-auto">
            {keywords.map((keyword, index) => (
              <button
                key={index}
                onClick={() => onKeywordClick(keyword)}
                className="w-full px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-left transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-gray-900 dark:text-gray-100 font-medium truncate">
                        {keyword.value}
                      </span>
                      {keyword.category && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 flex-shrink-0">
                          {keyword.category}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400 font-medium">
                    {keyword.emailCount} emails
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer with performance stats */}
      {processingTimeMs !== undefined && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
            ⚡ {processingTimeMs}ms • {topHits.length + keywords.length} results
          </div>
        </div>
      )}
    </div>
  );
}
