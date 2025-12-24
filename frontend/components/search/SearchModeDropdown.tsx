"use client";

import { useState, useRef, useEffect } from "react";
import { TbChevronDown, TbSearch, TbSparkles } from "react-icons/tb";

export type SearchMode = "fuzzy" | "semantic";

interface SearchModeDropdownProps {
  value: SearchMode;
  onChange: (mode: SearchMode) => void;
  disabled?: boolean;
}

const SEARCH_MODES = [
  {
    value: "fuzzy" as const,
    label: "Fuzzy Search",
    icon: TbSearch,
    description: "Fast keyword search with typo tolerance",
  },
  {
    value: "semantic" as const,
    label: "Semantic AI",
    icon: TbSparkles,
    description: "AI-powered meaning-based search",
  },
];

/**
 * SearchModeDropdown - Simple dropdown to select search mode
 * Compact design that fits inside search bar
 */
export default function SearchModeDropdown({
  value,
  onChange,
  disabled = false,
}: SearchModeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentMode = SEARCH_MODES.find((m) => m.value === value) || SEARCH_MODES[0];
  const Icon = currentMode.icon;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative">
      {/* Dropdown Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium
          border border-gray-300 dark:border-gray-600
          hover:bg-gray-100 dark:hover:bg-gray-800
          transition-colors
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          ${isOpen ? "bg-gray-100 dark:bg-gray-800" : "bg-white dark:bg-gray-900"}
        `}
        title={currentMode.description}
      >
        <Icon size={14} className={value === "semantic" ? "text-purple-600 dark:text-purple-400" : "text-blue-600 dark:text-blue-400"} />
        <span className="text-gray-700 dark:text-gray-300">{currentMode.label}</span>
        <TbChevronDown
          size={14}
          className={`text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
          {SEARCH_MODES.map((mode) => {
            const ModeIcon = mode.icon;
            const isSelected = mode.value === value;

            return (
              <button
                key={mode.value}
                onClick={() => {
                  onChange(mode.value);
                  setIsOpen(false);
                }}
                className={`
                  w-full flex items-start gap-3 px-3 py-2.5 text-left
                  hover:bg-gray-100 dark:hover:bg-gray-800
                  transition-colors
                  ${isSelected ? "bg-blue-50 dark:bg-blue-950/20" : ""}
                  ${mode.value === SEARCH_MODES[0].value ? "rounded-t-lg" : ""}
                  ${mode.value === SEARCH_MODES[SEARCH_MODES.length - 1].value ? "rounded-b-lg" : ""}
                `}
              >
                <ModeIcon
                  size={18}
                  className={`mt-0.5 ${
                    mode.value === "semantic"
                      ? "text-purple-600 dark:text-purple-400"
                      : "text-blue-600 dark:text-blue-400"
                  }`}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                      {mode.label}
                    </span>
                    {isSelected && (
                      <span className="text-xs text-blue-600 dark:text-blue-400">✓</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {mode.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
