import { useState, useEffect, useRef } from "react";
import { CiMail } from "react-icons/ci";
import {
  IoMdArrowBack,
  IoMdArrowForward,
  IoMdClose,
  IoMdMore,
  IoMdSend,
} from "react-icons/io";
import { BsArchive, BsTrash3 } from "react-icons/bs";
import { FaReply, FaShare } from "react-icons/fa";
import { type EmailData } from "@/types/index";

// --- CẤU HÌNH API ---
// Thay thế đường dẫn này bằng URL backend thực tế của bạn
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface MailContentProps {
  mail?: EmailData | null;
  onBack?: () => void;
  onForwardClick?: () => void;
  onReplyClick?: () => void;
  triggerReply?: number;
}

// ... (Giữ nguyên các hàm Helper: getSenderName, getSenderEmail, formatDate) ...
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

const MailContent = ({
  mail,
  onBack,
  onForwardClick,
  onReplyClick,
  triggerReply,
}: MailContentProps) => {
  const [isReplying, setIsReplying] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Trigger reply mode from parent (keyboard shortcut)
  useEffect(() => {
    if (triggerReply && triggerReply > 0) {
      setIsReplying(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerReply]);

  // Focus and scroll to reply textarea when reply mode is activated
  useEffect(() => {
    if (isReplying && replyTextareaRef.current) {
      replyTextareaRef.current.focus();
      replyTextareaRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [isReplying]);

  if (!mail) {
    return (
      <div className="flex flex-col w-full items-center justify-center h-full text-secondary bg-background/50">
        <CiMail className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-xl font-semibold mb-2 text-secondary">
          No Mail Selected
        </h2>
      </div>
    );
  }

  const senderName = getSenderName(mail.from);
  const senderEmail = getSenderEmail(mail.from);

  const handleReplyClick = () => {
    setIsReplying(true);
    // Tùy chọn: Thêm chữ ký hoặc trích dẫn email cũ vào body
    // setReplyBody(`\n\nOn ${formatDate(mail.date)}, ${senderName} wrote:\n> ...`);
  };

  const handleCancelReply = () => {
    setIsReplying(false);
    setReplyBody("");
  };

  // --- HÀM GỌI API REPLY ---
  const handleSendReply = async () => {
    if (!replyBody.trim()) return;
    // Giả sử mail object có thuộc tính id. Nếu id nằm ở chỗ khác (vd: mail.messageId), hãy sửa lại.
    if (!mail.id) {
      alert("Error: Cannot identify email ID.");
      return;
    }

    setIsSending(true);

    try {
      // 1. Lấy Token từ in-memory storage
      const token = typeof window !== "undefined" ? window.__accessToken : null;

      if (!token) {
        alert("Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.");
        setIsSending(false);
        return;
      }

      // 2. Gọi API
      const response = await fetch(`${API_BASE_URL}/emails/${mail.id}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // Header Auth Required
        },
        body: JSON.stringify({
          body: replyBody,
          isHtml: false, // Vì dùng textarea thường nên set là false. Nếu dùng RichEditor, set true.
          attachments: [], // Chưa xử lý file đính kèm trong UI này
        }),
      });

      // 3. Xử lý kết quả
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to send reply");
      }

      // Thành công
      // const data = await response.json(); // Nếu cần dùng dữ liệu trả về

      setIsReplying(false);
      setReplyBody("");
      alert("Reply sent successfully!");
    } catch (error: any) {
      console.error("Error sending reply:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-background text-gray-200 overflow-hidden relative">
      {/* --- TOP ACTION BAR --- */}
      <div className="flex flex-row justify-between items-center p-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4 text-gray-400">
          <button
            className="hover:text-white transition-color cursor-pointer"
            onClick={onBack}
          >
            <IoMdClose size={20} />
          </button>
          <div className="h-4 w-px bg-white/20 mx-1"></div>

          <button
            className="hover:text-white transition-colors md:hidden cursor-pointer"
            title="Back to Inbox"
            onClick={onBack}
          >
            <IoMdArrowBack size={20} />
          </button>

          <button className="hover:text-white transition-colors cursor-pointer">
            <IoMdArrowForward size={20} />
          </button>
        </div>

        <div className="flex items-center gap-2 text-gray-400">
          <button className="p-2 hover:bg-white/10 rounded-md transition-colors cursor-pointer">
            <BsArchive size={18} />
          </button>
          <button className="p-2 hover:bg-white/10 rounded-md transition-colors hover:text-red-400 cursor-pointer">
            <BsTrash3 size={18} />
          </button>
        </div>
      </div>

      {/* --- SCROLLABLE CONTENT AREA --- */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar pb-20">
        {/* Subject Header */}
        <div className="mb-6">
          <div className="flex flex-row justify-between items-start">
            <h1 className="text-xl md:text-2xl font-semibold text-white mb-3">
              {mail.subject || "(No Subject)"}
            </h1>
            <div className="flex gap-2">
              {mail.labelIds?.includes("SENT") && (
                <span className="bg-gray-700 text-xs px-2 py-1 rounded text-gray-300">
                  Sent Mail
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Sender Info Row */}
        <div className="flex flex-row justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold border border-white/10 text-lg shrink-0">
              {senderName.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{senderName}</span>
                <span className="text-xs text-gray-400">
                  &lt;{senderEmail}&gt;
                </span>
              </div>
              <span className="text-xs text-gray-500">To: {mail.to}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <span>{formatDate(mail.date)}</span>
            <button className="p-1 hover:bg-white/10 rounded hover:text-white cursor-pointer">
              <IoMdMore size={20} />
            </button>
          </div>
        </div>

        {/* Original Mail Body */}
        <div className="w-full bg-white text-secondary rounded-sm p-8 shadow-sm min-h-[200px] overflow-hidden border border-white/5">
          <div
            className="email-content-wrapper text-[15px] leading-relaxed"
            dangerouslySetInnerHTML={{
              __html:
                mail.htmlBody ||
                mail.textBody ||
                mail.snippet ||
                '<p class="text-secondary italic text-center mt-10">(No content available for this email)</p>',
            }}
          />
        </div>

        {/* --- REPLY EDITOR AREA --- */}
        {isReplying && (
          <div className="mt-6 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
              <FaReply /> Replying to{" "}
              <span className="text-white">{senderName}</span>
            </div>
            <textarea
              ref={replyTextareaRef}
              autoFocus
              className="w-full bg-[#1e1e1e] border border-white/20 rounded-md p-4 text-gray-200 focus:outline-none focus:border-blue-500 min-h-[150px] resize-y"
              placeholder="Type your reply here..."
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              disabled={isSending}
            />
            {/* Note: Nếu muốn thêm tính năng attach file, bạn cần thêm <input type="file"> ở đây và xử lý state attachments */}

            <div className="flex gap-3 mt-2">
              <button
                onClick={handleSendReply}
                disabled={isSending || !replyBody.trim()}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition-colors cursor-pointer"
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
                onClick={handleCancelReply}
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

      {/* --- BOTTOM ACTION BAR --- */}
      {!isReplying && (
        <div className="absolute bottom-6 left-6 flex flex-row gap-3">
          <button
            onClick={handleReplyClick}
            className="flex items-center gap-2 px-4 py-2 bg-[#2c2c2c] hover:bg-[#383838] text-gray-200 text-sm rounded border border-white/10 transition-colors cursor-pointer shadow-lg"
          >
            <FaReply /> Reply
          </button>
          <button
            onClick={onForwardClick}
            className="flex items-center gap-2 px-4 py-2 bg-[#2c2c2c] hover:bg-[#383838] text-gray-200 text-sm rounded border border-white/10 transition-colors cursor-pointer shadow-lg"
          >
            <FaShare /> Forward
          </button>
        </div>
      )}
    </div>
  );
};

export default MailContent;
