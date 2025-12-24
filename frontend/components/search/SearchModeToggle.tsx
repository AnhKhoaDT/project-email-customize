"use client";

import { useState } from "react";
import { HiSparkles } from "react-icons/hi";
import { TbSearch } from "react-icons/tb";

export type SearchMode = "fuzzy" | "semantic";

interface SearchModeToggleProps {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  disabled?: boolean;
}

/**
 * SearchModeToggle Component
 * Toggle between Fuzzy Search (typo-tolerant) and Semantic Search (meaning-based)
 * 
 * Features:
 * - Visual toggle with icons
 * - Tooltips explaining each mode
 * - Disabled state during searches
 */
export default function SearchModeToggle({
  mode,
  onModeChange,
  disabled = false,
}: SearchModeToggleProps) {
  const [showTooltip, setShowTooltip] = useState<SearchMode | null>(null);

  return (
    <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
      {/* Fuzzy Search Button */}
      <button
        onClick={() => onModeChange("fuzzy")}
        disabled={disabled}
        onMouseEnter={() => setShowTooltip("fuzzy")}
        onMouseLeave={() => setShowTooltip(null)}
        className={`
          relative flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
          ${
            mode === "fuzzy"
              ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        <TbSearch size={16} />
        <span>Fuzzy</span>
        
        {/* Tooltip */}
        {showTooltip === "fuzzy" && !disabled && (
          <div className="absolute top-full mt-2 left-0 z-50 w-56 p-2 bg-gray-900 dark:bg-gray-950 text-white text-xs rounded-lg shadow-lg">
            <div className="font-semibold mb-1">Fuzzy Search</div>
            <div className="text-gray-300">
              Tìm kiếm với tolerance cho typo, partial matching. 
              Nhanh (~50-200ms).
            </div>
            <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-900 dark:bg-gray-950 rotate-45"></div>
          </div>
        )}
      </button>

      {/* Semantic Search Button */}
      <button
        onClick={() => onModeChange("semantic")}
        disabled={disabled}
        onMouseEnter={() => setShowTooltip("semantic")}
        onMouseLeave={() => setShowTooltip(null)}
        className={`
          relative flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
          ${
            mode === "semantic"
              ? "bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        <HiSparkles size={16} />
        <span>Semantic</span>

        {/* Tooltip */}
        {showTooltip === "semantic" && !disabled && (
          <div className="absolute top-full mt-2 left-0 z-50 w-56 p-2 bg-gray-900 dark:bg-gray-950 text-white text-xs rounded-lg shadow-lg">
            <div className="font-semibold mb-1">Semantic Search (AI)</div>
            <div className="text-gray-300">
              Tìm kiếm dựa trên ngữ nghĩa, concept similarity. 
              Sử dụng AI embeddings.
            </div>
            <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-900 dark:bg-gray-950 rotate-45"></div>
          </div>
        )}
      </button>
    </div>
  );
}
