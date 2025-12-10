"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { useKanbanData } from "@/hooks/useKanbanData";
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
} from "react-icons/io";

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Main Content Container - Dark Mode Style */}
      <div className="w-[90vw] h-[90vh] md:w-[800px] bg-[#121212] rounded-xl shadow-2xl border border-white/10 flex flex-col overflow-hidden text-gray-200">
        {/* --- TOP ACTION BAR --- */}
        <div className="flex flex-row justify-between items-center p-4 border-b border-white/10 shrink-0 bg-[#1e1e1e]">
          <div className="flex items-center gap-4 text-gray-400">
            <button
              className="hover:text-white transition-colors cursor-pointer"
              onClick={onClose}
            >
              <IoMdClose size={24} />
            </button>
            <div className="h-4 w-px bg-white/20 mx-1"></div>
            <button
              className="hover:text-white transition-colors cursor-pointer"
              onClick={onClose} // Back acts as close here
            >
              <IoMdArrowBack size={20} />
            </button>
          </div>

          <div className="flex items-center gap-2 text-gray-400">
            <button
              className="p-2 hover:bg-white/10 rounded-md transition-colors cursor-pointer"
              title="Archive"
            >
              <BsArchive size={18} />
            </button>
            <button
              className="p-2 hover:bg-white/10 rounded-md transition-colors hover:text-red-400 cursor-pointer"
              title="Delete"
            >
              <BsTrash3 size={18} />
            </button>
          </div>
        </div>

        {/* --- SCROLLABLE CONTENT AREA --- */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar pb-20 bg-[#121212]">
          {/* Subject Header */}
          <div className="mb-6">
            <div className="flex flex-row justify-between items-start">
              <h1 className="text-xl md:text-2xl font-semibold text-white mb-2 leading-tight">
                {mail.subject || "(No Subject)"}
              </h1>
              <div className="flex gap-2">
                {mail.labelIds?.includes("SENT") && (
                  <span className="bg-gray-700 text-xs px-2 py-1 rounded text-gray-300">
                    Sent
                  </span>
                )}
                <span className="bg-blue-900/50 text-blue-200 text-xs px-2 py-1 rounded border border-blue-500/30">
                  Inbox
                </span>
              </div>
            </div>
          </div>

          {/* Sender Info Row */}
          <div className="flex flex-row justify-between items-start mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center text-white font-bold border border-white/10 text-xl shrink-0 shadow-lg">
                {senderName.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-lg">
                    {senderName}
                  </span>
                </div>
                <span className="text-sm text-gray-400">
                  &lt;{senderEmail}&gt;
                </span>
                <span className="text-xs text-gray-500 mt-0.5">
                  To: {mail.to}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm text-gray-400">
                {formatDate(mail.date)}
              </span>
              <button className="text-gray-500 hover:text-white">
                <IoMdMore size={20} />
              </button>
            </div>
          </div>

          {/* Mail Body */}
          <div className="w-full bg-[#1e1e1e] text-gray-200 rounded-lg p-8 shadow-sm min-h-[250px] border border-white/5 mb-6">
            <div
              className="email-content-wrapper text-[15px] leading-relaxed whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html:
                  mail.htmlBody ||
                  mail.textBody ||
                  '<p class="text-gray-500 italic">No content available</p>',
              }}
            />
          </div>

          {/* --- REPLY EDITOR AREA --- */}
          {isReplying && (
            <div className="mt-6 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200 border-t border-white/10 pt-6">
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                <FaReply /> Replying to{" "}
                <span className="text-white">{senderName}</span>
              </div>
              <textarea
                ref={replyTextareaRef}
                autoFocus
                className="w-full bg-[#1e1e1e] border border-white/20 rounded-md p-4 text-gray-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-h-[150px] resize-y"
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
                  className="px-4 py-2 hover:bg-white/10 text-gray-400 hover:text-white text-sm rounded transition-colors cursor-pointer"
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          <div className="h-10"></div>
        </div>

        {/* --- BOTTOM ACTION BAR (Sticky) --- */}
        {!isReplying && (
          <div className="absolute bottom-6 left-6 flex flex-row gap-3 z-10">
            <button
              onClick={handleReplyClick}
              className="flex items-center gap-2 px-4 py-2 bg-[#2c2c2c] hover:bg-[#383838] hover:scale-105 active:scale-95 text-gray-200 text-sm rounded-full border border-white/10 transition-all cursor-pointer shadow-lg"
            >
              <FaReply /> Reply
            </button>
            <button
              onClick={() => alert("Forward clicked")}
              className="flex items-center gap-2 px-4 py-2 bg-[#2c2c2c] hover:bg-[#383838] hover:scale-105 active:scale-95 text-gray-200 text-sm rounded-full border border-white/10 transition-all cursor-pointer shadow-lg"
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
      <div className="bg-white rounded-lg p-6 w-80 shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
            <TbClock className="text-blue-500" /> Snooze until...
          </h3>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onConfirm(5000)}
            className="p-3 text-left hover:bg-blue-50 rounded border transition-colors text-sm"
          >
            Later today (5 seconds )
          </button>
          <button
            onClick={() => onConfirm(10000)}
            className="p-3 text-left hover:bg-blue-50 rounded border transition-colors text-sm"
          >
            Tomorrow (10 seconds )
          </button>
          <button
            onClick={() => onConfirm(60000)}
            className="p-3 text-left hover:bg-blue-50 rounded border transition-colors text-sm"
          >
            Next Week (1 minute )
          </button>
        </div>
      </div>
    </div>
  );
};

// --- COMPONENT: MAIL CARD ---
const MailCard = ({ item, index, onSnoozeClick, onOpenClick }: any) => {
  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`bg-white rounded-lg border p-4 mb-3 shadow-sm relative overflow-hidden group hover:shadow-md transition-all cursor-grab active:cursor-grabbing ${
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
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600 text-xs">
                {item.avatar}
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-sm text-gray-800">
                  {item.sender}
                </span>
                <span className="text-xs text-gray-400">{item.time}</span>
              </div>
            </div>
          </div>

          <h3 className="font-bold text-sm text-gray-900 mb-2 pl-2">
            {item.subject}
          </h3>

          <div className="bg-gray-50 rounded p-3 mb-3 ml-2 text-xs text-gray-600 border border-gray-100">
            <div className="flex items-center gap-1 mb-1 text-gray-500 font-semibold">
              <HiSparkles className="text-purple-500" /> <span>AI Summary</span>
            </div>
            <p className="line-clamp-2">{item.summary}</p>
          </div>

          <div className="flex justify-between items-center pl-2 pt-2 border-t border-gray-50">
            <button
              onClick={() => onSnoozeClick(item)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-orange-600 transition-colors font-medium cursor-pointer"
            >
              <TbClock /> Snooze
            </button>
            <button
              onClick={() => onOpenClick(item)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors cursor-pointer"
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
  // Use custom hook for Kanban data
  const { columns, setColumns, isLoading, error, moveEmail, generateSummary } = useKanbanData();
  const [enabled, setEnabled] = useState(false);

  // State for Snooze Modal
  const [isSnoozeModalOpen, setSnoozeModalOpen] = useState(false);
  const [selectedItemToSnooze, setSelectedItemToSnooze] = useState<any>(null);

  // State for Reading Modal
  const [openedMail, setOpenedMail] = useState<EmailData | null>(null);

  useEffect(() => {
    const animation = requestAnimationFrame(() => setEnabled(true));
    return () => cancelAnimationFrame(animation);
  }, []);

  // Monitor Snooze Logic
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const snoozedList = columns.snoozed || [];
      const itemsToWakeUp = snoozedList.filter(
        (item: any) => item.snoozeUntil && item.snoozeUntil <= now
      );

      if (itemsToWakeUp.length > 0) {
        setColumns((prev: any) => {
          const remainingSnoozed = prev.snoozed.filter(
            (item: any) => item.snoozeUntil > now
          );
          const wokeUpItems = itemsToWakeUp.map((item: any) => {
            const { snoozeUntil, ...rest } = item;
            return { ...rest, time: "Just now" };
          });
          return {
            ...prev,
            snoozed: remainingSnoozed,
            inbox: [...prev.inbox, ...wokeUpItems],
          };
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [columns.snoozed]);

  const handleOpenSnooze = (item: any) => {
    setSelectedItemToSnooze(item);
    setSnoozeModalOpen(true);
  };

  const confirmSnooze = async (durationMs: number) => {
    if (!selectedItemToSnooze) return;
    
    const sourceColKey = (Object.keys(columns) as Array<keyof typeof columns>).find((key) =>
      columns[key].find((i: any) => i.id === selectedItemToSnooze.id)
    );
    if (!sourceColKey) return;

    try {
      const snoozedUntil = new Date(Date.now() + durationMs).toISOString();
      
      // Call API to snooze
      await api.post(`/emails/${selectedItemToSnooze.id}/snooze`, {
        threadId: selectedItemToSnooze.threadId,
        snoozedUntil,
      });

      // Optimistic update
      const snoozedItem = {
        ...selectedItemToSnooze,
        snoozeUntil: Date.now() + durationMs,
      };

      setColumns((prev: any) => {
        const sourceList = prev[sourceColKey].filter(
          (i: any) => i.id !== selectedItemToSnooze.id
        );
        return {
          ...prev,
          [sourceColKey]: sourceList,
          snoozed: [...prev.snoozed, snoozedItem],
        };
      });
    } catch (err) {
      console.error('Failed to snooze email:', err);
    }
    
    setSnoozeModalOpen(false);
    setSelectedItemToSnooze(null);
  };

  // --- LOGIC TO OPEN MAIL ---
  const handleOpenMail = (item: MailItem) => {
    // Convert Kanban MailItem to detailed EmailData
    const detailedMail: EmailData = {
      id: item.id,
      subject: item.subject,
      from: `${item.sender} <support@${item.sender
        .toLowerCase()
        .replace(/\s/g, "")}.com>`,
      to: "me@example.com",
      date: new Date().toISOString(), // Use current time or parse item.time
      textBody: item.summary,
      // Generating a fake body for demo purposes since Kanban item doesn't have it
      htmlBody: `
            <p style="font-size: 16px; color: #fff;">Hi there,</p>
            <p>${item.summary}</p>
            <br/>
            <p>Here are the details you requested. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
            <ul>
                <li>Item 1: Checked</li>
                <li>Item 2: Pending</li>
                <li>Item 3: <b>Done</b></li>
            </ul>
            <br/>
            <p>Best Regards,<br/>${item.sender}</p>
        `,
    };
    setOpenedMail(detailedMail);
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
    
    // Find the email being moved
    const movedEmail = columns[sourceColId].find((e: any) => e.id === draggableId);
    if (!movedEmail) return;

    try {
      // Call API to move email (optimistic update handled by hook)
      await moveEmail(
        movedEmail.id,
        movedEmail.threadId,
        sourceColId,
        destColId
      );
    } catch (err) {
      console.error('Failed to move email:', err);
    }
  };

  if (!enabled) return null;

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Kanban board...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <p className="text-red-600 mb-4">{error}</p>
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

  return (
    <div className="flex h-screen w-full bg-gray-50 text-slate-800">
      <DragDropContext onDragEnd={onDragEnd}>
        {/* Modals */}
        <SnoozeModal
          isOpen={isSnoozeModalOpen}
          onClose={() => setSnoozeModalOpen(false)}
          onConfirm={confirmSnooze}
        />

        {/* NEW: Mail Reading Modal */}
        <MailReadingModal
          isOpen={!!openedMail}
          mail={openedMail}
          onClose={() => setOpenedMail(null)}
        />

        <main className="grid grid-cols-3 h-full w-full divide-x divide-gray-200">
          {/* --- COLUMN INBOX --- */}
          <div className="flex flex-col h-full bg-white">
            <div className="p-4 border-b flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-gray-700">
                <FaInbox /> INBOX ({columns.inbox.length})
              </div>
              {columns.snoozed.length > 0 && (
                <div className="text-xs text-orange-500 flex items-center gap-1 bg-orange-50 px-2 py-1 rounded-full">
                  <TbZzz /> {columns.snoozed.length} Snoozed
                </div>
              )}
            </div>

            <Droppable droppableId="inbox">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="flex-1 p-3 overflow-y-auto"
                >
                  {columns.inbox.map((item: any, index: number) => (
                    <MailCard
                      key={item.id}
                      item={item}
                      index={index}
                      onSnoozeClick={handleOpenSnooze}
                      onOpenClick={handleOpenMail}
                      onGenerateSummary={generateSummary}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>

          {/* --- COLUMN TODO --- */}
          <div className="flex flex-col h-full overflow-hidden bg-white">
            <div className="p-4 flex flex-row items-center justify-between border-b border-gray-100 bg-white">
              <div className="flex items-center gap-2">
                <FaRegCircle size={16} className="text-orange-500" />
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                  To Do
                </h2>
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-bold">
                  {columns.todo.length}
                </span>
              </div>
              <button className="text-gray-400 hover:text-gray-600">
                <BsThreeDots />
              </button>
            </div>

            <Droppable droppableId="todo">
              {(provided, snapshot) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className={`flex-1 overflow-y-auto p-3 transition-colors ${
                    snapshot.isDraggingOver ? "bg-orange-50/50" : ""
                  }`}
                >
                  {columns.todo.map((item: any, index: number) => (
                    <MailCard
                      key={item.id}
                      item={item}
                      index={index}
                      onSnoozeClick={handleOpenSnooze}
                      onOpenClick={handleOpenMail}
                      onGenerateSummary={generateSummary}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>

          {/* --- COLUMN DONE --- */}
          <div className="flex flex-col h-full overflow-hidden bg-white">
            <div className="p-4 flex flex-row items-center justify-between border-b border-gray-100 bg-white">
              <div className="flex items-center gap-2">
                <FaRegCheckCircle size={16} className="text-green-500" />
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                  Done
                </h2>
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-bold">
                  {columns.done.length}
                </span>
              </div>
              <button className="text-gray-400 hover:text-gray-600">
                <BsThreeDots />
              </button>
            </div>

            <Droppable droppableId="done">
              {(provided, snapshot) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className={`flex-1 overflow-y-auto p-3 transition-colors ${
                    snapshot.isDraggingOver ? "bg-green-50/50" : ""
                  }`}
                >
                  {columns.done.map((item: any, index: number) => (
                    <MailCard
                      key={item.id}
                      item={item}
                      index={index}
                      onSnoozeClick={handleOpenSnooze}
                      onOpenClick={handleOpenMail}
                      onGenerateSummary={generateSummary}
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
