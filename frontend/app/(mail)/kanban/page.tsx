"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { useKanbanData } from "@/hooks/useKanbanData";
import { useTheme } from "@/contexts/ThemeContext";
import api from "@/lib/api";
// Icons for Kanban
import {
  TbLayoutSidebarRightExpandFilled,
  TbClock,
  TbMailOpened,
  TbZzz,
} from "react-icons/tb";
import {
  FaRegCircle,
  FaRegCheckCircle,
  FaInbox,
  FaReply,
  FaShare,
} from "react-icons/fa";
import { BsThreeDots, BsArchive, BsTrash3 } from "react-icons/bs";
import { HiSparkles } from "react-icons/hi";
import { X } from "lucide-react";

// Icons for Mail Detail View
import { CiMail } from "react-icons/ci";
import {
  IoMdArrowBack,
  IoMdArrowForward,
  IoMdClose,
  IoMdMore,
  IoMdSend,
  IoMdRefresh,
} from "react-icons/io";

import {
  TbFilter,
  TbSortAscending,
  TbSortDescending,
  TbPaperclip,
} from "react-icons/tb";

import { Check } from "lucide-react";

// --- TYPES ---
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
  hasAttachment: false;
};

// Detailed type for the Reading View
interface EmailData {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  textBody?: string;
  htmlBody?: string;
  snippet?: string;
  labelIds?: string[];
}

// --- NEW TYPES FOR FILTERING ---
type SortOrder = "newest" | "oldest";
type FilterReadStatus = "all" | "unread" | "read";

interface ColumnConfig {
  sort: SortOrder;
  filterRead: FilterReadStatus;
  filterAttachment: boolean;
}

// Default configuration
const defaultConfig: ColumnConfig = {
  sort: "newest",
  filterRead: "all",
  filterAttachment: false,
};

const ColumnHeader = ({
  title,
  count,
  icon,
  config,
  onConfigChange,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  config: ColumnConfig;
  onConfigChange: (newConfig: ColumnConfig) => void;
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="p-4 border-b dark:border-gray-800 flex justify-between items-center shrink-0 sticky top-0 bg-white dark:bg-[#121212] z-20">
      <div className="flex items-center gap-2 font-bold text-gray-700 dark:text-gray-200 text-sm">
        {icon}
        <span className="uppercase">{title}</span>
        <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-xs font-bold">
          {count}
        </span>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className={`p-1.5 rounded transition-colors ${
            showMenu
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

        {showMenu && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#1e1e1e] rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-2 z-30 animate-in fade-in zoom-in-95 duration-100">
            {/* Sorting Section */}
            <div className="mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-2">
                SORT BY DATE
              </p>
              <button
                onClick={() => onConfigChange({ ...config, sort: "newest" })}
                className={`w-full text-left px-2 py-1.5 text-sm rounded flex items-center justify-between ${
                  config.sort === "newest"
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <TbSortDescending /> Newest First
                </div>
                {config.sort === "newest" && <Check size={14} />}
              </button>
              <button
                onClick={() => onConfigChange({ ...config, sort: "oldest" })}
                className={`w-full text-left px-2 py-1.5 text-sm rounded flex items-center justify-between ${
                  config.sort === "oldest"
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
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
                    className={`flex-1 text-xs py-1 rounded capitalize transition-all ${
                      config.filterRead === status
                        ? "bg-white dark:bg-[#2c2c2c] shadow text-gray-900 dark:text-white font-medium"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
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
                className={`w-full text-left px-2 py-1.5 text-sm rounded flex items-center justify-between transition-colors ${
                  config.filterAttachment
                    ? "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
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
    </div>
  );
};

// Note: initialData removed - now using real data from useKanbanData hook

// --- HELPER FUNCTIONS FOR MAIL VIEW ---
const getSenderName = (fromStr: string) => {
  if (!fromStr) return "Unknown";
  const parts = fromStr.split("<");
  return parts[0].trim().replace(/"/g, "") || fromStr;
};
const getSenderEmail = (fromStr: string) => {
  if (!fromStr) return "";
  const match = fromStr.match(/<([^>]+)>/);
  return match ? match[1] : fromStr;
};
const formatDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    return dateStr;
  }
};

// --- COMPONENT: MAIL READING MODAL (User Provided Logic) ---
const MailReadingModal = ({
  isOpen,
  mail,
  onClose,
}: {
  isOpen: boolean;
  mail: EmailData | null;
  onClose: () => void;
}) => {
  const [isReplying, setIsReplying] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when mail changes
  useEffect(() => {
    setIsReplying(false);
    setReplyBody("");
  }, [mail]);

  useEffect(() => {
    if (isReplying && replyTextareaRef.current) {
      replyTextareaRef.current.focus();
      replyTextareaRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [isReplying]);

  if (!isOpen) return null;

  // Render Placeholder if no mail
  if (!mail) return null;

  const senderName = getSenderName(mail.from);
  const senderEmail = getSenderEmail(mail.from);

  const handleReplyClick = () => {
    setIsReplying(true);
  };

  const handleSendReply = async () => {
    if (!replyBody.trim()) return;
    setIsSending(true);
    // Simulate API Call
    setTimeout(() => {
      alert(`Reply sent to ${senderEmail}: \n${replyBody}`);
      setIsSending(false);
      setIsReplying(false);
      setReplyBody("");
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Main Content Container */}
      <div className="w-[90vw] h-[90vh] md:w-[850px] bg-background dark:bg-[#121212] rounded-xl shadow-2xl border border-divider dark:border-white/10 flex flex-col overflow-hidden">
        {/* --- TOP ACTION BAR --- */}
        <div className="flex flex-row justify-between items-center p-3 border-b border-divider dark:border-gray-800 shrink-0 bg-background dark:bg-[#1e1e1e]">
          <div className="flex items-center gap-4 text-secondary dark:text-gray-400">
            <button
              className="hover:text-foreground dark:hover:text-white transition-colors cursor-pointer"
              onClick={onClose}
            >
              <IoMdClose size={24} />
            </button>
            <div className="h-4 w-px bg-divider dark:bg-white/20 mx-1"></div>
            <button
              className="hover:text-foreground dark:hover:text-white transition-colors cursor-pointer"
              onClick={onClose}
            >
              <IoMdArrowBack size={20} />
            </button>
          </div>

          <div className="flex items-center gap-2 text-secondary dark:text-gray-400">
            <button
              className="p-2 hover:bg-muted dark:hover:bg-white/10 rounded-md transition-colors cursor-pointer"
              title="Archive"
            >
              <BsArchive size={18} />
            </button>
            <button
              className="p-2 hover:bg-muted dark:hover:bg-white/10 rounded-md transition-colors hover:text-red-400 cursor-pointer"
              title="Delete"
            >
              <BsTrash3 size={18} />
            </button>
          </div>
        </div>

        {/* --- SCROLLABLE CONTENT AREA --- */}
        <div className="flex-1 overflow-y-auto mailbox-scrollbar pb-20">
          {/* Subject and Sender Info - Unified Section */}
          <div className="px-6 pt-6 pb-4 bg-background dark:bg-[#121212] border-b border-divider dark:border-gray-800">
            {/* Subject Header */}
            <div className="mb-4">
              <div className="flex flex-row justify-between items-start gap-4">
                <h1 className="text-xl md:text-2xl font-semibold text-foreground dark:text-white flex-1">
                  {mail.subject || "(No Subject)"}
                </h1>
                <div className="flex gap-2 shrink-0">
                  {mail.labelIds?.includes("SENT") && (
                    <span className="bg-muted dark:bg-gray-700 text-xs px-2 py-1 rounded text-secondary dark:text-gray-300">
                      Sent Mail
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Sender Info Row */}
            <div className="flex flex-row justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                  {senderName.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground dark:text-white">
                      {senderName}
                    </span>
                    <span className="text-xs text-secondary dark:text-gray-400">
                      &lt;{senderEmail}&gt;
                    </span>
                  </div>
                  <span className="text-xs text-secondary dark:text-gray-500">
                    To: {mail.to}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-secondary dark:text-gray-400 text-sm">
                <span>{formatDate(mail.date)}</span>
                <button className="p-1 hover:bg-muted dark:hover:bg-white/10 rounded hover:text-foreground dark:hover:text-white cursor-pointer">
                  <IoMdMore size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* Mail Body with Iframe */}
          <div className="px-6 py-6">
            <div className="w-full bg-white dark:bg-[#1a1a1a] rounded-lg overflow-hidden border border-divider dark:border-gray-800 shadow-sm">
              <iframe
                ref={(iframe) => {
                  if (iframe) {
                    iframe.onload = () => {
                      try {
                        const iframeDoc =
                          iframe.contentDocument ||
                          iframe.contentWindow?.document;
                        if (iframeDoc) {
                          const height = iframeDoc.documentElement.scrollHeight;
                          iframe.style.height =
                            Math.max(height + 20, 200) + "px";
                        }
                      } catch (e) {
                        // Cross-origin restriction - fallback to min height
                        iframe.style.height = "500px";
                      }
                    };
                  }
                }}
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                className="w-full border-0"
                style={{ height: "200px" }}
                srcDoc={`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <meta charset="utf-8">
                      <base target="_blank">
                      <style>
                        body {
                          margin: 0;
                          padding: 2rem;
                          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                          font-size: 15px;
                          line-height: 1.7;
                          color: #475569;
                          background-color: transparent;
                          overflow: hidden;
                        }
                        a { 
                          color: #2563eb; 
                          text-decoration: underline;
                          cursor: pointer;
                        }
                        a:hover { text-decoration: none; }
                        * { max-width: 100%; }
                        img { max-width: 100%; height: auto; }
                        pre { white-space: pre-wrap; word-wrap: break-word; }
                      </style>
                    </head>
                    <body>
                      ${
                        mail.htmlBody ||
                        mail.textBody ||
                        mail.snippet ||
                        '<p style="text-align: center; font-style: italic; color: #94a3b8; margin-top: 2.5rem;">(No content available)</p>'
                      }
                    </body>
                  </html>
                `}
              />
            </div>
          </div>

          {/* --- REPLY EDITOR AREA --- */}
          {isReplying && (
            <div className="px-6 pb-6 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
              <div className="flex items-center gap-2 text-sm text-secondary dark:text-gray-400 mb-1">
                <FaReply /> Replying to{" "}
                <span className="text-foreground dark:text-white font-medium">
                  {senderName}
                </span>
              </div>
              <textarea
                ref={replyTextareaRef}
                autoFocus
                className="w-full bg-background dark:bg-[#1e1e1e] border border-divider dark:border-gray-700 rounded-md p-4 text-foreground dark:text-gray-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[150px] resize-y"
                placeholder="Type your reply here..."
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                disabled={isSending}
              />

              <div className="flex gap-3 mt-2">
                <button
                  onClick={handleSendReply}
                  disabled={isSending || !replyBody.trim()}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition-colors cursor-pointer font-medium"
                >
                  {isSending ? (
                    "Sending..."
                  ) : (
                    <>
                      <IoMdSend /> Send
                    </>
                  )}
                </button>
                <button
                  onClick={() => setIsReplying(false)}
                  disabled={isSending}
                  className="px-4 py-2 hover:bg-muted dark:hover:bg-white/10 text-secondary dark:text-gray-400 hover:text-foreground dark:hover:text-white text-sm rounded transition-colors cursor-pointer"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>

        {/* --- BOTTOM ACTION BAR --- */}
        {!isReplying && (
          <div className="border-t border-divider dark:border-gray-800 p-4 flex flex-row gap-3 bg-background dark:bg-[#121212]">
            <button
              onClick={handleReplyClick}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm rounded transition-colors cursor-pointer"
            >
              <FaReply /> Reply
            </button>
            <button
              onClick={() => alert("Forward clicked")}
              className="flex items-center gap-2 px-4 py-2 bg-muted dark:bg-[#2c2c2c] hover:bg-muted/80 dark:hover:bg-[#383838] text-foreground dark:text-gray-200 text-sm rounded transition-colors cursor-pointer"
            >
              <FaShare /> Forward
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- COMPONENT: SNOOZE MODAL ---
const SnoozeModal = ({ isOpen, onClose, onConfirm }: any) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1e1e1e] rounded-lg p-6 w-80 shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <TbClock className="text-blue-500" /> Snooze until...
          </h3>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onConfirm(5000)}
            className="p-3 text-left hover:bg-blue-50 dark:hover:bg-gray-800 rounded border dark:border-gray-700 dark:text-gray-200 transition-colors text-sm"
          >
            Later today (5 seconds )
          </button>
          <button
            onClick={() => onConfirm(10000)}
            className="p-3 text-left hover:bg-blue-50 dark:hover:bg-gray-800 rounded border dark:border-gray-700 dark:text-gray-200 transition-colors text-sm"
          >
            Tomorrow (10 seconds )
          </button>
          <button
            onClick={() => onConfirm(60000)}
            className="p-3 text-left hover:bg-blue-50 dark:hover:bg-gray-800 rounded border dark:border-gray-700 dark:text-gray-200 transition-colors text-sm"
          >
            Next Week (1 minute )
          </button>
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

  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`bg-white dark:bg-[#1a1a1a] rounded-lg border dark:border-gray-800 p-4 mb-3 shadow-sm relative overflow-hidden group hover:shadow-md transition-all cursor-grab active:cursor-grabbing ${
            snapshot.isDragging
              ? "shadow-xl ring-2 ring-blue-400 rotate-2 opacity-90 cursor-grabbing"
              : ""
          }`}
          style={{ ...provided.draggableProps.style }}
        >
          {item.color !== "bg-transparent" && (
            <div
              className={`absolute left-0 top-0 bottom-0 w-1 ${item.color}`}
            />
          )}

          <div className="flex flex-row justify-between items-start mb-2 pl-2">
            <div className="flex gap-3 items-center">
              <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 text-xs">
                {item.avatar}
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">
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
                className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Regenerate summary (10/min limit)"
              >
                <IoMdRefresh
                  className={`w-3.5 h-3.5 ${
                    isRegenerating ? "animate-spin" : ""
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
      )}
    </Draggable>
  );
};

// --- MAIN PAGE ---
export default function KanbanPage() {
  // 1. ALL HOOKS MUST BE DECLARED FIRST
  const {
    columns,
    setColumns,
    isLoading,
    error,
    moveEmail,
    generateSummary,
    snoozeEmail,
    unsnoozeEmail,
  } = useKanbanData();

  const [enabled, setEnabled] = useState(false);

  // State for Snooze Modal
  const [isSnoozeModalOpen, setSnoozeModalOpen] = useState(false);
  const [selectedItemToSnooze, setSelectedItemToSnooze] = useState<any>(null);

  // State for Reading Modal
  const [openedMail, setOpenedMail] = useState<EmailData | null>(null);

  // State for Column Configs
  const [columnConfigs, setColumnConfigs] = useState<{
    inbox: ColumnConfig;
    todo: ColumnConfig;
    done: ColumnConfig;
  }>({
    inbox: { ...defaultConfig },
    todo: { ...defaultConfig },
    done: { ...defaultConfig },
  });

  // Effect for animation
  useEffect(() => {
    const animation = requestAnimationFrame(() => setEnabled(true));
    return () => cancelAnimationFrame(animation);
  }, []);

  // --- MOVED UP: Filtering Logic (useMemo) ---
  // This must be above any 'return' statements
  const processEmails = useMemo(() => {
    const process = (items: any[], config: ColumnConfig) => {
      // Safety check
      if (!items) return [];

      // --- FIX: DEDUPLICATE ITEMS BASED ON ID ---
      // This creates a Map where the ID is the key, ensuring uniqueness.
      // Then it converts the Map values back to an array.
      const uniqueItems = Array.from(
        new Map(items.map((item) => [item.id, item])).values()
      );

      let result = [...uniqueItems];

      // 1. Filter by Read Status
      if (config.filterRead === "unread") {
        result = result.filter((item) => item.isUnread);
      } else if (config.filterRead === "read") {
        result = result.filter((item) => !item.isUnread);
      }

      // 2. Filter by Attachment
      if (config.filterAttachment) {
        result = result.filter((item) => item.hasAttachment);
      }

      // 3. Sort by Date
      result.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return config.sort === "newest" ? dateB - dateA : dateA - dateB;
      });

      return result;
    };

    return {
      inbox: process(columns.inbox || [], columnConfigs.inbox),
      todo: process(columns.todo || [], columnConfigs.todo),
      done: process(columns.done || [], columnConfigs.done),
    };
  }, [columns, columnConfigs]);

  // --- HELPER FUNCTIONS (Not Hooks, so placement is flexible, but good practice to keep here) ---
  const handleOpenSnooze = (item: any) => {
    setSelectedItemToSnooze(item);
    setSnoozeModalOpen(true);
  };

  const confirmSnooze = async (durationMs: number) => {
    if (!selectedItemToSnooze) return;

    const sourceColKey = (
      Object.keys(columns) as Array<keyof typeof columns>
    ).find((key) =>
      columns[key].find((i: any) => i.id === selectedItemToSnooze.id)
    );
    if (!sourceColKey) return;

    try {
      const snoozedUntil = new Date(Date.now() + durationMs).toISOString();
      await snoozeEmail(
        selectedItemToSnooze.id,
        selectedItemToSnooze.threadId,
        snoozedUntil,
        sourceColKey
      );
    } catch (err) {
      console.error("Failed to snooze email:", err);
    }

    setSnoozeModalOpen(false);
    setSelectedItemToSnooze(null);
  };

  const handleOpenMail = async (item: MailItem) => {
    try {
      const response = await api.get(`/emails/${item.id}`);
      const emailData = response.data;
      const detailedMail: EmailData = {
        id: emailData.id,
        subject: emailData.subject,
        from: emailData.from,
        to: emailData.to,
        date: emailData.date,
        textBody: emailData.textBody,
        htmlBody: emailData.htmlBody,
        snippet: emailData.snippet,
        labelIds: emailData.labelIds,
      };
      setOpenedMail(detailedMail);
    } catch (error) {
      console.error("Failed to fetch email details:", error);
      const detailedMail: EmailData = {
        id: item.id,
        subject: item.subject,
        from:
          item.from ||
          `${item.sender} <${item.sender
            .toLowerCase()
            .replace(/\s/g, "")}@example.com>`,
        to: "me@example.com",
        date: item.date || new Date().toISOString(),
        textBody: item.summary,
        snippet: item.summary,
      };
      setOpenedMail(detailedMail);
    }
  };

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    const sourceColId = source.droppableId as keyof typeof columns;
    const destColId = destination.droppableId as keyof typeof columns;
    const movedEmail = columns[sourceColId].find(
      (e: any) => e.id === draggableId
    );

    if (!movedEmail) return;

    try {
      await moveEmail(
        movedEmail.id,
        movedEmail.threadId,
        sourceColId,
        destColId,
        destination.index
      );
    } catch (err) {
      console.error("Failed to move email:", err);
    }
  };

  // --- CONDITIONAL RENDERING (Must happen AFTER all hooks) ---

  if (!enabled) return null;

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-[#0a0a0a]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">
            Loading Kanban board...
          </p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-[#0a0a0a]">
        <div className="text-center max-w-md">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // --- FINAL RENDER ---
  return (
    <div className="flex flex-col h-full w-full bg-gray-50 dark:bg-[#0a0a0a] text-slate-800 dark:text-gray-100">
      <DragDropContext onDragEnd={onDragEnd}>
        {/* ... (Rest of your JSX remains exactly the same) ... */}
        {/* Modals */}
        <SnoozeModal
          isOpen={isSnoozeModalOpen}
          onClose={() => setSnoozeModalOpen(false)}
          onConfirm={confirmSnooze}
        />

        <MailReadingModal
          isOpen={!!openedMail}
          mail={openedMail}
          onClose={() => setOpenedMail(null)}
        />

        <main className="grid grid-cols-1 md:grid-cols-3 flex-1 w-full divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-800 min-h-0 overflow-y-auto md:overflow-hidden">
          {/* INBOX */}
          <div className="flex flex-col min-h-[500px] md:h-full bg-white dark:bg-[#121212] md:min-h-0">
            <ColumnHeader
              title="Inbox"
              count={columns.inbox.length}
              icon={<FaInbox />}
              config={columnConfigs.inbox}
              onConfigChange={(newConfig) =>
                setColumnConfigs((prev) => ({ ...prev, inbox: newConfig }))
              }
            />
            <Droppable droppableId="inbox">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="flex-1 p-3 md:overflow-y-auto kanban-scrollbar"
                >
                  {processEmails.inbox.map((item: any, index: number) => (
                    <MailCard
                      key={item.id}
                      item={item}
                      index={index}
                      onSnoozeClick={handleOpenSnooze}
                      onOpenClick={handleOpenMail}
                      onRegenerateSummary={generateSummary}
                    />
                  ))}
                  {processEmails.inbox.length === 0 &&
                    columns.inbox.length > 0 && (
                      <div className="text-center py-10 text-gray-400 text-sm italic">
                        No emails match the selected filters.
                      </div>
                    )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>

          {/* TODO */}
          <div className="flex flex-col min-h-[500px] md:h-full bg-white dark:bg-[#121212] md:min-h-0">
            {/* ... Render ColumnHeader & Droppable for TODO using processEmails.todo ... */}
            <ColumnHeader
              title="To Do"
              count={columns.todo.length}
              icon={<FaRegCircle className="text-orange-500" />}
              config={columnConfigs.todo}
              onConfigChange={(newConfig) =>
                setColumnConfigs((prev) => ({ ...prev, todo: newConfig }))
              }
            />
            <Droppable droppableId="todo">
              {(provided, snapshot) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className={`flex-1 md:overflow-y-auto kanban-scrollbar p-3 transition-colors ${
                    snapshot.isDraggingOver
                      ? "bg-orange-50/50 dark:bg-orange-900/20"
                      : ""
                  }`}
                >
                  {processEmails.todo.map((item: any, index: number) => (
                    <MailCard
                      key={item.id}
                      item={item}
                      index={index}
                      onSnoozeClick={handleOpenSnooze}
                      onOpenClick={handleOpenMail}
                      onRegenerateSummary={generateSummary}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>

          {/* DONE */}
          <div className="flex flex-col min-h-[500px] md:h-full bg-white dark:bg-[#121212] md:min-h-0">
            {/* ... Render ColumnHeader & Droppable for DONE using processEmails.done ... */}
            <ColumnHeader
              title="Done"
              count={columns.done.length}
              icon={<FaRegCheckCircle className="text-green-500" />}
              config={columnConfigs.done}
              onConfigChange={(newConfig) =>
                setColumnConfigs((prev) => ({ ...prev, done: newConfig }))
              }
            />
            <Droppable droppableId="done">
              {(provided, snapshot) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className={`flex-1 md:overflow-y-auto kanban-scrollbar p-3 transition-colors ${
                    snapshot.isDraggingOver
                      ? "bg-green-50/50 dark:bg-green-900/20"
                      : ""
                  }`}
                >
                  {processEmails.done.map((item: any, index: number) => (
                    <MailCard
                      key={item.id}
                      item={item}
                      index={index}
                      onSnoozeClick={handleOpenSnooze}
                      onOpenClick={handleOpenMail}
                      onRegenerateSummary={generateSummary}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </main>
      </DragDropContext>
    </div>
  );
}
