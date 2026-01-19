"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";

// 1. Import thư viện kéo thả (Quan trọng cho KanbanColumn)
import {
  DragDropContext,
  Droppable, // <--- Cần cái này cho KanbanColumn
  Draggable, // <--- Cần cái này cho MailCard
  DropResult,
} from "@hello-pangea/dnd";

// 2. Import hooks và contexts của bạn (Giữ nguyên như cũ)
import { KanbanEmail } from "@/hooks/useKanbanData";
import { useKanbanData } from "@/hooks/useKanbanData";
import { useTheme } from "@/contexts/ThemeContext";
import api from "@/lib/api";

// 3. Import Icons (Dùng cho props 'icon' truyền vào KanbanColumn)
import {
  TbLayoutSidebarRightExpandFilled,
  TbClock,
  TbMailOpened,
  TbZzz,
  TbFilter,
  TbSortDescending,
  TbSortAscending,
  TbPaperclip,
} from "react-icons/tb";

import {
  FaRegCircle,
  FaRegCheckCircle,
  FaInbox,
  FaReply,
  FaShare,
} from "react-icons/fa";

import {
  BsThreeDots,
  BsArchive,
  BsTrash3
} from "react-icons/bs";

import { HiSparkles } from "react-icons/hi";
import { Check, X } from "lucide-react"; // Shadcn thường dùng Lucide

import {
  IoMdRefresh,
  IoMdClose,
  IoMdArrowBack,
  IoMdMore,
  IoMdSend
} from "react-icons/io";

// --- TYPES ---
// Bạn cần đảm bảo các interface này được define trước khi component sử dụng
interface ColumnConfig {
  sort: "manual" | "newest" | "oldest";
  filterRead: "all" | "unread" | "read";
  filterAttachment: boolean;
}

type MailItem = {
  id: string;
  threadId: string;
  sender: string;
  time: string;
  avatar: string;
  subject: string;
  summary?: string;
  color: string;
  snoozeUntil?: number;
  from?: string;
  date?: string;
  snippet?: string;
  status?: string;
  isUnread: boolean;
  hasAttachment: boolean;
};

// --- NEW COMPONENT: KANBAN COLUMN ---
interface KanbanColumnProps {
  id: string; // "inbox" | "todo" | "done"
  title: string;
  icon: React.ReactNode;
  items: MailItem[]; // Danh sách email đã qua filter/sort
  totalRawItems: number; // Tổng số email gốc (để check hiển thị thông báo "No match")
  config: ColumnConfig;
  onConfigChange: (newConfig: ColumnConfig) => void;
  // Các action handler truyền xuống MailCard
  onSnoozeClick: (item: any) => void;
  onOpenClick: (item: any) => void;
  onRegenerateSummary: (id: string, force: boolean) => Promise<any>;
  // Tùy chỉnh giao diện drag over
  dragOverClass?: string;
  color?: string;
  gmailLabel?: string;
  gmailLabelName?: string;
  autoArchive?: boolean;
  // Label error tracking
  hasLabelError?: boolean;
  labelErrorMessage?: string;
  onRecoverLabel?: () => void;
  // Delete column
  onDeleteColumn?: () => void;
  isSystemColumn?: boolean;
  // Edit title
  onEditTitle?: (newTitle: string) => void;
  // Loading state
  isLoading?: boolean;
  // Infinite scroll props
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

const ColumnHeader = ({
  title,
  count,
  icon,
  config,
  onConfigChange,
  color,
  hasLabelError,
  labelErrorMessage,
  onRecoverLabel,
  onDeleteColumn,
  isSystemColumn,
  onEditTitle,
  gmailLabel,
  gmailLabelName,
  autoArchive,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  config: ColumnConfig;
  onConfigChange: (newConfig: ColumnConfig) => void;
  color: string;
  hasLabelError?: boolean;
  labelErrorMessage?: string;
  onRecoverLabel?: () => void;
  onDeleteColumn?: () => void;
  isSystemColumn?: boolean;
  onEditTitle?: (newTitle: string) => void;
  gmailLabel?: string;
  gmailLabelName?: string;
  autoArchive?: boolean;
}) => {
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showErrorTooltip, setShowErrorTooltip] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(title);

  // Update editTitle when title prop changes
  useEffect(() => {
    setEditTitle(title);
  }, [title]);

  // Edit handlers
  const handleTitleEdit = () => {
    if (!onEditTitle || isSystemColumn) return;
    setIsEditingTitle(true);
  };

  const handleTitleSave = () => {
    if (!onEditTitle) {
      setIsEditingTitle(false);
      return;
    }

    const trimmed = editTitle.trim();

    // If empty or unchanged, just cancel
    if (!trimmed || trimmed === title) {
      setEditTitle(title);
      setIsEditingTitle(false);
      return;
    }

    // Call parent handler to save
    onEditTitle(trimmed);
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setEditTitle(title); // Reset to original
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleTitleCancel();
    }
  };
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setShowFilterMenu(false);
      }
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node)) {
        setShowOptionsMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="p-4 border-b dark:border-gray-800 flex justify-between items-center shrink-0 sticky top-0 bg-white dark:bg-[#121212] z-20">
      <div className="flex items-center gap-2 font-bold text-sm">
        <span style={{ color: color }} className="flex items-center">
          {icon}
        </span>
        {isEditingTitle ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            onBlur={handleTitleSave}
            className="bg-transparent border-b border-current focus:outline-none uppercase text-sm font-bold text-slate-800 dark:text-gray-100"
            style={{ minWidth: '80px' }}
            autoFocus
            maxLength={100}
          />
        ) : (
          <span
            className={`uppercase text-slate-800 dark:text-gray-100 ${!isSystemColumn && onEditTitle ? 'cursor-pointer hover:opacity-70' : ''}`}
            onClick={handleTitleEdit}
            title={!isSystemColumn && onEditTitle ? 'Click to edit' : ''}
          >
            {title}
          </span>
        )}
        <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-xs font-bold">
          {count}
        </span>

        {/* Label Error Warning - Don't show for autoArchive columns */}
        {hasLabelError && !autoArchive && (
          <div className="relative">
            <button
              onMouseEnter={() => setShowErrorTooltip(true)}
              onMouseLeave={() => setShowErrorTooltip(false)}
              onClick={onRecoverLabel}
              className="text-yellow-500 hover:text-yellow-600 dark:text-yellow-400 dark:hover:text-yellow-300 transition-colors cursor-pointer"
              title="Gmail label error - click to fix"
            >
              ⚠️
            </button>

            {showErrorTooltip && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 shadow-lg z-50 text-xs text-gray-700 dark:text-gray-300 font-normal">
                <div className="flex items-start gap-2">
                  <span className="text-yellow-500 shrink-0">⚠️</span>
                  <div>
                    <p className="font-semibold text-yellow-700 dark:text-yellow-400 mb-1">
                      Gmail Label Not Found
                    </p>
                    <p className="text-gray-600 dark:text-gray-400">
                      {labelErrorMessage || 'The Gmail label for this column was deleted or is invalid.'}
                    </p>
                    <p className="text-gray-500 dark:text-gray-500 mt-2 italic">
                      Click to recover this column
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* Filter Button */}
        <div className="relative" ref={filterMenuRef}>
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className={`cursor-pointer p-1.5 rounded transition-colors ${showFilterMenu
              ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
              : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
          >
            {/* Show a dot if filters are active */}
            {(config.filterRead !== "all" || config.filterAttachment) && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full border border-white dark:border-[#121212]"></span>
            )}
            <TbFilter size={18} />
          </button>

          {showFilterMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#1e1e1e] rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-2 z-30 animate-in fade-in zoom-in-95 duration-100">
              {/* Sorting Section */}
              <div className="mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-2">
                  SORT BY DATE
                </p>
                <button
                  onClick={() => onConfigChange({ ...config, sort: config.sort === "newest" ? "manual" : "newest" })}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded flex items-center justify-between ${config.sort === "newest"
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 cursor-pointer"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <TbSortDescending /> Newest First
                  </div>
                  {config.sort === "newest" && <Check size={14} />}
                </button>
                <button
                  onClick={() => onConfigChange({ ...config, sort: config.sort === "oldest" ? "manual" : "oldest" })}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded flex items-center justify-between ${config.sort === "oldest"
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 cursor-pointer"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <TbSortAscending /> Oldest First
                  </div>
                  {config.sort === "oldest" && <Check size={14} />}
                </button>
              </div>

              {/* Filter Section */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-2">
                  FILTER
                </p>

                {/* Read Status */}
                <div className="flex bg-gray-100 dark:bg-gray-800 rounded p-1 mb-2">
                  {(["all", "unread", "read"] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() =>
                        onConfigChange({ ...config, filterRead: status })
                      }
                      className={`flex-1 text-xs py-1 rounded capitalize transition-all ${config.filterRead === status
                        ? "bg-white dark:bg-[#2c2c2c] shadow text-gray-900 dark:text-white font-medium cursor-pointer"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:bg-gray-700 cursor-pointer"
                        }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>

                {/* Attachment Toggle */}
                <button
                  onClick={() =>
                    onConfigChange({
                      ...config,
                      filterAttachment: !config.filterAttachment,
                    })
                  }
                  className={`w-full text-left px-2 py-1.5 text-sm rounded flex items-center justify-between transition-colors ${config.filterAttachment
                    ? "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 cursor-pointer"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <TbPaperclip /> Has Attachment
                  </div>
                  {config.filterAttachment && <Check size={14} />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Options Menu (3 dots) */}
        <div className="relative" ref={optionsMenuRef}>
          <button
            onClick={() => setShowOptionsMenu(!showOptionsMenu)}
            className={`p-1.5 rounded transition-colors ${showOptionsMenu
              ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 cursor-pointer"
              : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
              }`}
          >
            <BsThreeDots size={18} />
          </button>

          {showOptionsMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#1e1e1e] rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-2 z-30 animate-in fade-in zoom-in-95 duration-100">
              {/* Gmail Label Info - Always show */}
              <div className="px-3 py-2 mb-2 border-b border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Gmail Label Mapping</div>
                {gmailLabel || autoArchive ? (
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }}></span>
                    {autoArchive ? 'ARCHIVE' : (gmailLabelName || gmailLabel)}
                  </div>
                ) : (
                  <div className="text-sm italic text-gray-400 dark:text-gray-500">
                    Not mapped
                  </div>
                )}
              </div>
              
              {/* Delete Column Button - Only show for non-system columns */}
              {!isSystemColumn && onDeleteColumn ? (
                <button
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete column "${title}"? This action cannot be undone.`)) {
                      onDeleteColumn();
                      setShowOptionsMenu(false);
                    }
                  }}
                  className="w-full text-left px-3 py-2 text-sm rounded flex items-center gap-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
                >
                  <BsTrash3 size={14} /> Delete Column
                </button>
              ) : (
                <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500 italic">
                  No options available
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- COMPONENT: MAIL CARD ---
const MailCard = ({
  item,
  index,
  onSnoozeClick,
  onOpenClick,
  onRegenerateSummary,
}: any) => {
  const [isRegenerating, setIsRegenerating] = React.useState(false);
  const [rateLimitError, setRateLimitError] = React.useState<string | null>(
    null
  );

  const handleRegenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRegenerating(true);
    setRateLimitError(null);
    try {
      const result = await onRegenerateSummary(item.id, true); // forceRegenerate = true

      // Check for rate limit error
      if (result === null) {
        setRateLimitError("Rate limit exceeded. Please wait a moment.");
      }
    } catch (error: any) {
      if (error?.response?.status === 429) {
        setRateLimitError("Too many requests. Please try again later.");
      }
    } finally {
      setIsRegenerating(false);
      // Clear error after 3 seconds
      if (rateLimitError) {
        setTimeout(() => setRateLimitError(null), 3000);
      }
    }
  };

  // Safety check: ensure item has valid id
  if (!item?.id) {
    console.error('MailCard: item.id is missing', item);
    return null;
  }

  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => {
        // Fix scroll offset issue by using fixed positioning when dragging
        return (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`bg-white dark:bg-[#1a1a1a] rounded-lg border dark:border-gray-800 p-4 mb-3 shadow-sm relative overflow-hidden group hover:shadow-md transition-all cursor-grab active:cursor-grabbing ${snapshot.isDragging
                ? "shadow-xl ring-2 ring-blue-400 opacity-90 cursor-grabbing"
                : ""
              }`}
            style={{
              ...provided.draggableProps.style,
              // Fix scroll offset during drag
              transform: snapshot.isDragging 
                ? provided.draggableProps.style?.transform 
                : provided.draggableProps.style?.transform,
            }}
          >
            {item.color !== "bg-transparent" && (
              <div
                className={`absolute left-0 top-0 bottom-0 w-1 ${item.color}`}
              />
            )}

            <div className="flex flex-row justify-between items-start mb-2 pl-2">
              <div className="flex gap-3 items-center min-w-0 flex-1">
                <div className="w-8 h-8 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 text-xs">
                  {item.avatar}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-semibold text-sm text-gray-800 dark:text-gray-200 truncate">
                    {item.sender}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {item.time}
                  </span>
                </div>
              </div>
            </div>

            <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-2 pl-2">
              {item.subject}
            </h3>

            <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 mb-3 ml-2 text-xs text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 font-semibold">
                  <HiSparkles className="text-purple-500 dark:text-purple-400" />{" "}
                  <span>AI Summary</span>
                </div>
                <button
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  title="Regenerate summary (10/min limit)"
                >
                  <IoMdRefresh
                    className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""
                      }`}
                  />
                </button>
              </div>
              {rateLimitError && (
                <p className="text-red-500 dark:text-red-400 text-xs mb-1">
                  {rateLimitError}
                </p>
              )}
              <p className="line-clamp-2">{item.summary}</p>
            </div>

            <div className="flex justify-between items-center pl-2 pt-2 border-t border-gray-50 dark:border-gray-800">
              <button
                onClick={() => onSnoozeClick(item)}
                className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors font-medium cursor-pointer"
              >
                <TbClock /> Snooze
              </button>
              <button
                onClick={() => onOpenClick(item)}
                className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                Open Mail <TbMailOpened />
              </button>
            </div>
          </div>
        );
      }}
    </Draggable>
  );
};

const KanbanColumn = ({
  id,
  title,
  icon,
  items,
  totalRawItems,
  config,
  onConfigChange,
  onSnoozeClick,
  onOpenClick,
  onRegenerateSummary,
  dragOverClass = "bg-gray-50 dark:bg-gray-900/50", // Màu mặc định khi kéo thả vào
  color = "#64748b",
  gmailLabel,
  gmailLabelName,
  autoArchive,
  hasLabelError = false,
  labelErrorMessage,
  onRecoverLabel,
  onDeleteColumn, 
  isSystemColumn = false,
  onEditTitle,
  isLoading = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: KanbanColumnProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Infinite scroll detection
  useEffect(() => {
    if (!onLoadMore || !hasMore || isLoadingMore) return;
    
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
      
      // Trigger when scrolled to 80% of content
      if (scrollPercentage > 0.8) {
        console.log(`🚀 Triggering loadMore for column ${id}`);
        onLoadMore();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [hasMore, isLoadingMore, onLoadMore, id]);

  const columnBorderClass = (hasLabelError && !autoArchive)
    ? "border-yellow-400 dark:border-yellow-600 border-2"
    : "border-r border-gray-200 dark:border-gray-800 border-t-2";

  const columnOpacity = hasLabelError ? "opacity-75" : "";

  return (
    <div
      className={`flex flex-col flex-1 w-full bg-white dark:bg-[#121212] ${columnBorderClass} ${columnOpacity}`}
      style={{ borderTopColor: hasLabelError ? '#facc15' : color }}
    >
      <div style={{ color: hasLabelError ? '#facc15' : color }}>
        <ColumnHeader
          title={title}
          count={items.length} // Hoặc totalRawItems nếu muốn hiển thị tổng số
          icon={icon}
          config={config}
          onConfigChange={onConfigChange}
          color={hasLabelError ? '#facc15' : color}
          hasLabelError={hasLabelError}
          labelErrorMessage={labelErrorMessage}
          onRecoverLabel={onRecoverLabel}
          onDeleteColumn={onDeleteColumn}
          isSystemColumn={isSystemColumn}
          onEditTitle={onEditTitle}
          gmailLabel={gmailLabel}
          gmailLabelName={gmailLabelName}
          autoArchive={autoArchive}
        />
      </div>

      <Droppable droppableId={id} isDropDisabled={(hasLabelError && !autoArchive) || isLoading}>
        {(provided, snapshot) => (
          <div
            {...provided.droppableProps}
            ref={(el) => {
              provided.innerRef(el);
              scrollContainerRef.current = el;
            }}
            className={`flex-1 p-3 transition-colors min-h-0 ${
              snapshot.isDraggingOver ? dragOverClass : ""
              } ${(hasLabelError && !autoArchive) ? 'bg-yellow-50/30 dark:bg-yellow-900/5' : ''}`}
          >
            {/* Show loading spinner */}
            {isLoading && (
              <div key="loading-spinner" className="flex items-center justify-center py-8">
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading emails...</p>
                </div>
              </div>
            )}

            {/* Show error message if label is broken */}
            {!isLoading && hasLabelError && !autoArchive && (
              <div key="label-error" className="mb-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-yellow-500">⚠️</span>
                  <div className="flex-1">
                    <p className="font-semibold text-yellow-700 dark:text-yellow-400">
                      Cannot sync with Gmail
                    </p>
                    <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">
                      Drag & drop disabled.
                    </p>
                    {onRecoverLabel && (
                      <button
                        onClick={onRecoverLabel}
                        className="mt-2 px-3 py-1.5 text-xs font-medium bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-white rounded-md transition-colors flex items-center gap-1.5 shadow-sm hover:shadow hover:cursor-pointer"
                      >
                        <span>⚙️</span>
                        Click me to fix
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Render danh sách MailCard */}
            {!isLoading && items.filter(item => item?.id).map((item: any, index: number) => (
              <MailCard
                key={item.id}
                item={item}
                index={index}
                onSnoozeClick={onSnoozeClick}
                onOpenClick={onOpenClick}
                onRegenerateSummary={onRegenerateSummary}
              />
            ))}

            {/* Hiển thị thông báo nếu lọc không ra kết quả */}
            {!isLoading && items.length === 0 && totalRawItems > 0 && (
              <div key="no-match" className="text-center py-10 text-gray-400 text-sm italic">
                No emails match the selected filters.
              </div>
            )}

            {/* Hiển thị thông báo nếu cột trống hoàn toàn */}
            {!isLoading && items.length === 0 && totalRawItems === 0 && !(hasLabelError && !autoArchive) && (
              <div key="empty" className="text-center flex-1 py-10 text-gray-300 dark:text-gray-600 text-sm border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-lg m-2">
                Empty
              </div>
            )}

            {/* Loading more indicator */}
            {!isLoading && isLoadingMore && (
              <div className="flex justify-center items-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary dark:border-blue-500"></div>
                <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                  Loading more...
                </span>
              </div>
            )}

            {/* End of list indicator - No more emails */}
            {!isLoading && !hasMore && items.length > 0 && (
              <div className="text-center flex-1 text-gray-400 dark:text-gray-500 text-xs py-4 border-t border-gray-100 dark:border-gray-800 mt-2">
                No more emails to load
              </div>
            )}

            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};

export default KanbanColumn;