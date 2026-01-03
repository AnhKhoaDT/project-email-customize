"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import KanbanColumn from "@/components/ui/KanbanColumn"; // Đảm bảo đường dẫn đúng
import RecoverLabelModal from "@/components/ui/RecoverLabelModal";
import {
  DragDropContext,
  Droppable, // Cần import Droppable nếu muốn kéo thả CỘT (Level 2)
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { useKanbanData, KanbanEmail } from "@/hooks/useKanbanData";
import api, { fetchGmailLabels, createKanbanColumn, reorderKanbanColumns } from "@/lib/api";
import { useToast } from "@/contexts/toast-context";

// Icons
import {
  TbClock,
  TbMailOpened,
  TbFilter,
  TbSortDescending,
  TbSortAscending,
  TbPaperclip,
  TbPlus,
} from "react-icons/tb";
import {
  FaRegCircle,
  FaRegCheckCircle,
  FaInbox,
  FaReply,
  FaShare,
} from "react-icons/fa";
import { BsArchive, BsTrash3 } from "react-icons/bs";
import { HiSparkles } from "react-icons/hi";
import { X, Check } from "lucide-react";
import {
  IoMdClose,
  IoMdArrowBack,
  IoMdMore,
  IoMdSend,
  IoMdRefresh,
} from "react-icons/io";

const COLOR_PALETTE = [
  "#64748b", // Slate
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#84cc16", // Lime
  "#22c55e", // Green
  "#10b981", // Emerald
  "#14b8a6", // Teal
  "#06b6d4", // Cyan
  "#0ea5e9", // Sky
  "#3b82f6", // Blue
  "#6366f1", // Indigo
  "#8b5cf6", // Violet
  "#a855f7", // Purple
  "#d946ef", // Fuchsia
  "#ec4899", // Pink
  "#f43f5e", // Rose
];

// --- CONFIG TYPES ---
type SortOrder = "newest" | "oldest";
type FilterReadStatus = "all" | "unread" | "read";

interface ColumnConfig {
  sort: SortOrder;
  filterRead: FilterReadStatus;
  filterAttachment: boolean;
}

const defaultConfig: ColumnConfig = {
  sort: "newest",
  filterRead: "all",
  filterAttachment: false,
};

// --- HELPER COMPONENTS (SnoozeModal, MailReadingModal, etc.) ---
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
  mail: KanbanEmail | null;
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
                      ${mail.htmlBody ||
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
          className={`bg-white dark:bg-[#1a1a1a] rounded-lg border dark:border-gray-800 p-4 mb-3 shadow-sm relative overflow-hidden group hover:shadow-md transition-all cursor-grab active:cursor-grabbing ${snapshot.isDragging
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
      )}
    </Draggable>
  );
};

// --- MAIN PAGE ---
export default function KanbanPage() {
  // 1. DATA HOOK
  const {
    columns, // Lưu ý: columns ở đây phải là mảng Array<Column> từ hook
    setColumns, // Hàm cập nhật state optimistic
    isLoading,
    error,
    moveEmail,
    generateSummary,
    snoozeEmail,
    addColumn, // <-- Giả sử hook đã có hàm này
    deleteColumn, // <-- Hàm xóa cột
    updateColumnTitle, // <-- Hàm cập nhật tên cột
    fetchColumnData, // <-- Hàm fetch emails cho một cột
    columnLoadingStates, // <-- Loading states cho từng cột
    refreshData, // <-- Thêm refreshData để reload sau khi tạo column
  } = useKanbanData();

  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(false);

  // Modals State
  const [isSnoozeModalOpen, setSnoozeModalOpen] = useState(false);
  const [selectedItemToSnooze, setSelectedItemToSnooze] = useState<any>(null);
  const [openedMail, setOpenedMail] = useState<any | null>(null);

  // Recovery Modal State
  const [isRecoveryModalOpen, setRecoveryModalOpen] = useState(false);
  const [recoveryColumnId, setRecoveryColumnId] = useState("");
  const [recoveryColumnName, setRecoveryColumnName] = useState("");
  const [recoveryOriginalLabel, setRecoveryOriginalLabel] = useState("");

  // Add Column Inline Form State (Trello-style)
  const [isCreatingCol, setIsCreatingCol] = useState(false);
  const [newColTitle, setNewColTitle] = useState("");
  const [newColColor, setNewColColor] = useState(COLOR_PALETTE[0]);
  const [customColor, setCustomColor] = useState("");

  // Gmail Label Selection State
  const [gmailLabels, setGmailLabels] = useState<any[]>([]);
  const [selectedLabelOption, setSelectedLabelOption] = useState<"new" | "existing">("new");
  const [selectedExistingLabel, setSelectedExistingLabel] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [isLoadingLabels, setIsLoadingLabels] = useState(false);

  // Validation State
  const [validationError, setValidationError] = useState("");

  // 2. DYNAMIC CONFIG STATE
  // Thay vì fix cứng inbox/todo/done, ta dùng Record để lưu config cho bất kỳ ID nào
  const [columnConfigs, setColumnConfigs] = useState<Record<string, ColumnConfig>>({});

  // Validation: Check for duplicate column name
  const checkDuplicateColumnName = (name: string, excludeColumnId?: string): boolean => {
    return columns.some((col: any) =>
      col.id !== excludeColumnId && // Exclude current column when editing
      col.title.toLowerCase().trim() === name.toLowerCase().trim()
    );
  };

  // Validation: Check for duplicate Gmail label (already mapped to a column)
  const checkDuplicateGmailLabel = (label: string): boolean => {
    return columns.some((col: any) =>
      col.gmailLabel && col.gmailLabel.toLowerCase() === label.toLowerCase()
    );
  };

  // Validation: Check if Gmail label already exists on Gmail (any label, not just mapped ones)
  const checkGmailLabelExists = (labelName: string): boolean => {
    return gmailLabels.some((label: any) =>
      label.name.toLowerCase() === labelName.toLowerCase()
    );
  };

  // Validation: Check for Gmail reserved label names
  const GMAIL_RESERVED_LABELS = [
    'inbox', 'sent', 'drafts', 'spam', 'trash', 'starred',
    'important', 'unread', 'chat', 'scheduled', 'snoozed'
  ];

  const isReservedGmailLabel = (labelName: string): boolean => {
    return GMAIL_RESERVED_LABELS.includes(labelName.toLowerCase().trim());
  };

  // Real-time validation when inputs change
  useEffect(() => {
    if (!isCreatingCol) {
      setValidationError("");
      return;
    }

    const trimmedTitle = newColTitle.trim();

    // Check column name
    if (trimmedTitle && checkDuplicateColumnName(trimmedTitle)) {
      setValidationError(`Column name "${trimmedTitle}" already exists`);
      return;
    }

    // Check Gmail label
    if (selectedLabelOption === "new") {
      const labelName = (newLabelName.trim() || trimmedTitle);

      // First check if it's a reserved Gmail label name
      if (labelName && isReservedGmailLabel(labelName)) {
        setValidationError(`Cannot use reserved Gmail label name "${labelName}". Reserved labels: ${GMAIL_RESERVED_LABELS.join(', ')}`);
        return;
      }

      // Then check if creating new label with name that already exists on Gmail
      if (labelName && checkGmailLabelExists(labelName)) {
        setValidationError(`Gmail label "${labelName}" already exists. Please use "Use existing label" option or choose a different name.`);
        return;
      }

      // Then check if label is already mapped to another column
      if (labelName && checkDuplicateGmailLabel(labelName.toLowerCase())) {
        setValidationError(`Gmail label "${labelName}" is already mapped to another column`);
        return;
      }
    } else if (selectedLabelOption === "existing" && selectedExistingLabel) {
      if (checkDuplicateGmailLabel(selectedExistingLabel)) {
        setValidationError(`Gmail label "${selectedExistingLabel}" is already mapped to another column`);
        return;
      }
    }

    // Clear error if all validations pass
    setValidationError("");
  }, [newColTitle, newLabelName, selectedLabelOption, selectedExistingLabel, isCreatingCol, columns, gmailLabels]);

  // Helper để lấy config an toàn (nếu chưa có thì lấy default)
  const getColConfig = (colId: string) => columnConfigs[colId] || defaultConfig;

  // Helper update config
  const handleConfigChange = (colId: string, newConfig: ColumnConfig) => {
    setColumnConfigs((prev) => ({
      ...prev,
      [colId]: newConfig,
    }));
  };

  // Animation Effect
  useEffect(() => {
    const animation = requestAnimationFrame(() => setEnabled(true));
    return () => cancelAnimationFrame(animation);
  }, []);

  // 3. PROCESS EMAILS (Filtering & Sorting)
  const processedColumns = useMemo(() => {
    if (!columns || !Array.isArray(columns)) return [];

    return columns.map((col) => {
      const config = getColConfig(col.id);
      let items = [...(col.items || [])];

      // Deduplicate
      items = Array.from(new Map(items.map((item) => [item.id, item])).values());

      // Filter: Read Status
      if (config.filterRead === "unread") {
        items = items.filter((item) => item.isUnread);
      } else if (config.filterRead === "read") {
        items = items.filter((item) => !item.isUnread);
      }

      // Filter: Attachment
      if (config.filterAttachment) {
        items = items.filter((item) => item.hasAttachment);
      }

      // Sort: Date
      items.sort((a, b) => {
        const dateA = new Date(a.date || "").getTime();
        const dateB = new Date(b.date || "").getTime();
        return config.sort === "newest" ? dateB - dateA : dateA - dateB;
      });

      return {
        ...col,
        items, // Trả về column với items đã được xử lý
      };
    });
  }, [columns, columnConfigs]);

  // --- HANDLERS ---
  // Edit column name handler
  const handleEditColumnTitle = async (columnId: string, newTitle: string) => {
    // Validate
    const trimmedTitle = newTitle.trim();

    if (!trimmedTitle) {
      showToast("Column name cannot be empty", "error");
      return;
    }

    if (trimmedTitle.length > 100) {
      showToast("Column name must be less than 100 characters", "error");
      return;
    }

    // Check duplicate name (exclude current column)
    if (checkDuplicateColumnName(trimmedTitle, columnId)) {
      showToast(`Column name "${trimmedTitle}" already exists`, "error");
      return;
    }

    try {
      // Use updateColumnTitle hook for optimistic update (no reload needed)
      await updateColumnTitle(columnId, trimmedTitle);
      showToast(`Column renamed to "${trimmedTitle}" successfully`, "success");
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err.message || "Failed to update column name";
      showToast(errorMsg, "error");
    }
  };

  const handleCreateColumn = async () => {
    if (!newColTitle.trim()) {
      setIsCreatingCol(false);
      return;
    }

    try {
      // Determine which Gmail label to use
      let gmailLabelToUse = "";

      if (selectedLabelOption === "new") {
        // Use column title as label name if not specified
        gmailLabelToUse = newLabelName.trim() || newColTitle.trim();
      } else {
        // Use existing label
        gmailLabelToUse = selectedExistingLabel;
      }

      if (!gmailLabelToUse) {
        alert("Please select or create a Gmail label");
        return;
      }

      // Use addColumn hook for optimistic update (no reload needed)
      await addColumn(
        newColTitle,
        newColColor,
        gmailLabelToUse,
        selectedLabelOption === "new"
      );

      // Reset form
      setNewColTitle("");
      setNewColColor(COLOR_PALETTE[0]);
      setSelectedLabelOption("new");
      setSelectedExistingLabel("");
      setNewLabelName("");
      setValidationError("");
      setIsCreatingCol(false);

      // Show success toast
      showToast(`Column "${newColTitle}" created successfully`, "success");
    } catch (err: any) {
      console.error("Failed to create column:", err);

      // Extract error message from various response formats
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to create column. Please try again.";

      // Show error toast
      showToast(errorMessage, "error");

      // Don't close form on error - let user fix it
    }
  };

  // Fetch Gmail labels when opening the form
  useEffect(() => {
    if (isCreatingCol) {
      setIsLoadingLabels(true);
      fetchGmailLabels()
        .then((labels) => {
          console.log("📧 Fetched Gmail labels:", labels);
          console.log("📊 Label breakdown:", {
            total: labels.length,
            system: labels.filter((l: any) => l.type === "system").length,
            user: labels.filter((l: any) => l.type === "user").length,
          });
          setGmailLabels(Array.isArray(labels) ? labels : []);
        })
        .catch((err) => {
          console.error("❌ Failed to fetch Gmail labels:", err);
          setGmailLabels([]);
        })
        .finally(() => {
          setIsLoadingLabels(false);
        });
    }
  }, [isCreatingCol]);

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;

    // COLUMN reorder
    if (result.type === "COLUMN") {
      // No-op if same position
      if (source.droppableId === destination.droppableId && source.index === destination.index) return;

      // Optimistic update of columns order
      const backup = [...columns];
      const newColumns = Array.from(columns);
      const [moved] = newColumns.splice(source.index, 1);
      newColumns.splice(destination.index, 0, moved);

      setColumns(newColumns);

      try {
        const order = newColumns.map(c => c.id);
        await reorderKanbanColumns(order);
        showToast('Columns reordered successfully', 'success');
      } catch (err: any) {
        console.error('Failed to persist column order', err);
        showToast('Failed to reorder columns. Reverting.', 'error');
        setColumns(backup);
      }

      return;
    }

    // Kéo thả CARD (Email)
    if (result.type === "DEFAULT" || !result.type) {
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      ) return;

      const sourceCol = columns.find((c: any) => c.id === source.droppableId);
      const movedEmail = sourceCol?.items.find((e: any) => e.id === draggableId);

      if (movedEmail) {
        await moveEmail(
          movedEmail.id,
          movedEmail.threadId,
          source.droppableId,
          destination.droppableId,
          destination.index
        );
      }
    }

    // TODO: Kéo thả COLUMN (Nếu bạn muốn sắp xếp cột)
    // if (result.type === "COLUMN") { ... logic reorder columns ... }
  };

  // Helper chọn icon dựa trên ID hoặc Title
  const getColumnIcon = (col: any) => {
    if (col.id === "inbox") return <FaInbox className="text-blue-500" />;
    if (col.id === "done" || col.title.toLowerCase() === "done") return <FaRegCheckCircle className="text-green-500" />;
    if (col.id === "todo" || col.title.toLowerCase().includes("todo")) return <FaRegCircle className="text-orange-500" />;
    return <FaRegCircle />; // Default icon
  };

  // Helper chọn màu nền kéo thả
  const getDragOverClass = (col: any) => {
    if (col.id === "inbox") return "bg-blue-50/50 dark:bg-blue-900/20";
    if (col.id === "done") return "bg-green-50/50 dark:bg-green-900/20";
    return "bg-gray-50/50 dark:bg-gray-800/50";
  };

  if (!enabled) return null;
  if (isLoading) return <div className="p-10 text-center">Loading...</div>;
  if (error) return <div className="p-10 text-center text-red-500">{error}</div>;

  return (
    <div className="flex flex-col h-full w-full bg-gray-50 dark:bg-[#0a0a0a] text-slate-800 dark:text-gray-100">
      <DragDropContext onDragEnd={onDragEnd}>


        <main className="flex flex-row w-full divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-800 min-h-0">

          {/* 1. DYNAMIC COLUMNS RENDERING */}
          <Droppable droppableId="board" direction="horizontal" type="COLUMN">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex flex-row h-full overflow-x-auto overflow-y-hidden items-start" // CSS cho container ngang
              >
                {processedColumns.map((col, index) => {
                  const originalCol = columns.find((c: any) => c.id === col.id);
                  const isColumnLoading = columnLoadingStates[col.id] || false;

                  return (
                    <Draggable key={col.id} draggableId={col.id} index={index}>
                      {(providedDrag, snapshot) => (
                        <div
                          ref={providedDrag.innerRef}
                          {...providedDrag.draggableProps}
                          {...providedDrag.dragHandleProps} // Gắn drag handle vào div bao ngoài
                          className={`flex flex-col shrink-0 w-[350px] md:w-2/7 min-h-[500px] md:h-full bg-white dark:bg-[#121212] md:min-h-0
                          ${snapshot.isDragging ? "opacity-100 z-50 rotate-2 shadow-2xl ring-1 ring-blue-500/50" : ""}
                        `}
                        >
                          <KanbanColumn
                            key={col.id}
                            id={col.id}
                            title={col.title}
                            color={col.color}
                            icon={getColumnIcon(col)}
                            items={col.items}
                            totalRawItems={originalCol?.items.length || 0}
                            config={getColConfig(col.id)}
                            onConfigChange={(newConfig) => handleConfigChange(col.id, newConfig)}
                            onSnoozeClick={(item) => {
                              setSelectedItemToSnooze(item);
                              setSnoozeModalOpen(true);
                            }}
                            onOpenClick={(item) => {
                              setOpenedMail(item);
                            }}
                            onRegenerateSummary={generateSummary}
                            dragOverClass={getDragOverClass(col)}
                            hasLabelError={originalCol?.hasLabelError}
                            labelErrorMessage={originalCol?.labelErrorMessage}
                            isSystemColumn={originalCol?.isSystem}
                            isLoading={isColumnLoading}
                            onEditTitle={!originalCol?.isSystem ? (newTitle) => handleEditColumnTitle(col.id, newTitle) : undefined}
                            onRecoverLabel={() => {
                              setRecoveryColumnId(col.id);
                              setRecoveryColumnName(col.title);
                              setRecoveryOriginalLabel(originalCol?.gmailLabel || "");
                              setRecoveryModalOpen(true);
                            }}
                            onDeleteColumn={!originalCol?.isSystem ? async () => {
                              try {
                                await deleteColumn(col.id);
                                showToast(`Column "${col.title}" deleted successfully`, "success");
                              } catch (err: any) {
                                const errorMsg = err?.response?.data?.message || err.message || "Failed to delete column";
                                showToast(errorMsg, "error");
                              }
                            } : undefined}
                          />
                        </div>
                      )}
                    </Draggable>
                  );

                })}

                {/* 4. Placeholder bắt buộc phải có */}
                {provided.placeholder}

                {/* 2. ADD COLUMN AREA (Trello-style inline form) */}
                <div className="shrink-0 w-80 p-4 h-full flex flex-col justify-start">
                  {!isCreatingCol ? (
                    <button
                      onClick={() => setIsCreatingCol(true)}
                      className="w-full h-12 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer"
                    >
                      <TbPlus size={20} />
                      <span className="font-medium">Add Section</span>
                    </button>
                  ) : (
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200">

                      {/* Header */}
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">New Column</h3>
                        <button
                          onClick={() => {
                            setIsCreatingCol(false);
                            setNewColTitle("");
                            setNewColColor(COLOR_PALETTE[0]);
                            setCustomColor("");
                            setSelectedLabelOption("new");
                            setSelectedExistingLabel("");
                            setNewLabelName("");
                          }}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        >
                          <X size={18} />
                        </button>
                      </div>

                      {/* 1. INPUT TÊN CỘT */}
                      <div className="mb-4">
                        <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 block">
                          Column Name
                        </label>
                        <input
                          autoFocus
                          value={newColTitle}
                          onChange={(e) => {
                            setNewColTitle(e.target.value);
                            if (selectedLabelOption === "new") {
                              setNewLabelName(e.target.value);
                            }
                          }}
                          placeholder="e.g., Review, Urgent, Done"
                          className={`w-full px-3 py-2.5 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${validationError && newColTitle.trim() && checkDuplicateColumnName(newColTitle.trim())
                            ? "border-red-500 focus:ring-red-500"
                            : "focus:ring-blue-500"
                            }`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !validationError) handleCreateColumn();
                            if (e.key === "Escape") setIsCreatingCol(false);
                          }}
                        />
                      </div>

                      {/* Validation Error Display */}
                      {validationError && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                          <div className="flex items-start gap-2">
                            <span className="text-red-500 text-sm">⚠️</span>
                            <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                              {validationError}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* 2. GMAIL LABEL SELECTION */}
                      <div className="mb-4">
                        <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 block">
                          Gmail Label Mapping
                        </label>

                        {/* Radio Options */}
                        <div className="space-y-3">
                          <label className="flex items-start gap-2 cursor-pointer group">
                            <input
                              type="radio"
                              checked={selectedLabelOption === "new"}
                              onChange={() => {
                                setSelectedLabelOption("new");
                                setNewLabelName(newColTitle);
                              }}
                              className="w-4 h-4 mt-0.5 text-blue-500 focus:ring-blue-500"
                            />
                            <div className="flex-1">
                              <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">Create new label</span>
                              {selectedLabelOption === "new" && (
                                <input
                                  value={newLabelName}
                                  onChange={(e) => setNewLabelName(e.target.value)}
                                  placeholder="Label name (default: column name)"
                                  className="w-full mt-2 px-3 py-2 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                              )}
                            </div>
                          </label>

                          <label className="flex items-start gap-2 cursor-pointer group">
                            <input
                              type="radio"
                              checked={selectedLabelOption === "existing"}
                              onChange={() => setSelectedLabelOption("existing")}
                              className="w-4 h-4 mt-0.5 text-blue-500 focus:ring-blue-500"
                            />
                            <div className="flex-1">
                              <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">Use existing label</span>
                              {selectedLabelOption === "existing" && (
                                <div className="mt-2">
                                  <select
                                    value={selectedExistingLabel}
                                    onChange={(e) => setSelectedExistingLabel(e.target.value)}
                                    disabled={isLoadingLabels}
                                    className="w-full px-3 py-2 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <option value="" className="bg-white dark:bg-gray-900">
                                      {isLoadingLabels ? "Loading labels..." : "Select a label..."}
                                    </option>

                                    {/* System Labels Group */}
                                    {gmailLabels.filter(l => l.type === "system").length > 0 && (
                                      <optgroup label="System Labels" className="bg-white dark:bg-gray-900">
                                        {gmailLabels
                                          .filter((label) => label.type === "system")
                                          .map((label) => (
                                            <option key={label.id} value={label.name} className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                                              {label.name}
                                            </option>
                                          ))}
                                      </optgroup>
                                    )}

                                    {/* User Labels Group */}
                                    {gmailLabels.filter(l => l.type === "user").length > 0 && (
                                      <optgroup label="Custom Labels" className="bg-white dark:bg-gray-900">
                                        {gmailLabels
                                          .filter((label) => label.type === "user")
                                          .map((label) => (
                                            <option key={label.id} value={label.name} className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                                              {label.name}
                                            </option>
                                          ))}
                                      </optgroup>
                                    )}
                                  </select>
                                  {!isLoadingLabels && gmailLabels.length === 0 && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                                      No labels found. Please check your Gmail connection.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* 3. COLOR PICKER */}
                      <div className="mb-4">
                        <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 block">
                          Column Color
                        </label>
                        <div className="flex flex-wrap gap-2.5 items-center">
                          {COLOR_PALETTE.map((color) => (
                            <button
                              key={color}
                              onClick={() => {
                                setNewColColor(color);
                                setCustomColor("");
                              }}
                              type="button"
                              className={`w-8 h-8 rounded-full transition-all hover:scale-110 shadow-md ${newColColor === color && !customColor
                                ? "ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-500 dark:ring-offset-gray-800 scale-110"
                                : "opacity-70 hover:opacity-100"
                                }`}
                              style={{ backgroundColor: color }}
                              title={color}
                            />
                          ))}

                          {/* Custom Color Picker */}
                          <div className="relative group">
                            <input
                              type="color"
                              value={customColor || newColColor}
                              onChange={(e) => {
                                setCustomColor(e.target.value);
                                setNewColColor(e.target.value);
                              }}
                              className="w-8 h-8 rounded-full cursor-pointer opacity-0 absolute inset-0"
                              title="Custom color"
                            />
                            <div
                              className={`w-8 h-8 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center transition-all hover:scale-110 hover:border-blue-500 ${customColor
                                ? "ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-500 dark:ring-offset-gray-800 scale-110"
                                : ""
                                }`}
                              style={{ backgroundColor: customColor || "transparent" }}
                            >
                              {!customColor && (
                                <TbPlus size={16} className="text-gray-400 dark:text-gray-500" />
                              )}
                            </div>
                          </div>
                        </div>
                        {customColor && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Custom: {customColor}
                          </p>
                        )}
                      </div>

                      {/* 4. ACTION BUTTONS */}
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          onClick={() => {
                            setIsCreatingCol(false);
                            setNewColTitle("");
                            setNewColColor(COLOR_PALETTE[0]);
                            setCustomColor("");
                            setSelectedLabelOption("new");
                            setSelectedExistingLabel("");
                            setNewLabelName("");
                          }}
                          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleCreateColumn}
                          disabled={!!validationError || !newColTitle.trim() || (selectedLabelOption === "existing" && !selectedExistingLabel)}
                          style={{ backgroundColor: customColor || newColColor }}
                          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-semibold rounded-lg shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-md"
                        >
                          <Check size={16} /> Create Column
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Droppable>

        </main>
      </DragDropContext>

      {/* Recovery Modal */}
      <RecoverLabelModal
        isOpen={isRecoveryModalOpen}
        onClose={() => setRecoveryModalOpen(false)}
        columnId={recoveryColumnId}
        columnName={recoveryColumnName}
        originalLabel={recoveryOriginalLabel}
        existingColumns={columns}
        onApplyOptimistic={(colId: string, patch: any) => {
          const backup = columns;
          if (patch._delete) {
            setColumns(prev => prev.filter(c => c.id !== colId));
          } else {
            setColumns(prev => prev.map(c => c.id === colId ? { ...c, ...patch, hasLabelError: false, labelErrorMessage: undefined } : c));
          }
          return () => setColumns(backup);
        }}
        onSuccess={(serverData?: any) => {
          // If server returned updated label info, merge it into state
          if (serverData && serverData.data && serverData.data.columnId) {
            const data = serverData.data;
            setColumns(prev => prev.map(c => {
              if (c.id !== data.columnId) return c;
              return {
                ...c,
                gmailLabel: data.newLabelId || data.newGmailLabel || c.gmailLabel,
                gmailLabelName: data.labelName || c.gmailLabelName,
                hasLabelError: false,
                labelErrorMessage: undefined,
              };
            }));
            return;
          }

          // Fallback: refresh minimally by calling refreshData
          refreshData();
        }}
      />

      {/* Mail Reading Modal */}
      <MailReadingModal
        isOpen={!!openedMail}
        mail={openedMail}
        onClose={() => setOpenedMail(null)}
      />

      {/* Snooze Modal */}
      <SnoozeModal
        isOpen={isSnoozeModalOpen}
        onClose={() => {
          setSnoozeModalOpen(false);
          setSelectedItemToSnooze(null);
        }}
        onConfirm={async (delayMs: number) => {
          if (selectedItemToSnooze) {
            const snoozedUntil = new Date(Date.now() + delayMs).toISOString();
            try {
              // Find source column ID
              const sourceColumnId = columns.find(col =>
                col.items.some(item => item.id === selectedItemToSnooze.id)
              )?.id;

              if (sourceColumnId) {
                await snoozeEmail(
                  selectedItemToSnooze.id,
                  selectedItemToSnooze.threadId,
                  snoozedUntil,
                  sourceColumnId,
                  () => showToast(`Email snoozed successfully until ${new Date(snoozedUntil).toLocaleString()}`, "success"),
                  (error: any) => {
                    const errorMsg = error?.response?.data?.message || error.message || "Failed to snooze email";
                    showToast(errorMsg, "error");
                  }
                );
              }
            } catch (err: any) {
              const errorMsg = err?.response?.data?.message || err.message || "Failed to snooze email";
              showToast(errorMsg, "error");
            }
          }
          setSnoozeModalOpen(false);
          setSelectedItemToSnooze(null);
        }}
      />
    </div>
  );
}