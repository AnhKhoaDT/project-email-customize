import { useState, useEffect, useRef } from "react";
import { CiMail } from "react-icons/ci";
import {
  IoMdArrowBack,
  IoMdArrowForward,
  IoMdClose,
  IoMdMore,
  IoMdSend,
} from "react-icons/io";
import { BsArchive, BsTrash3, BsInboxFill } from "react-icons/bs";
import { FaReply, FaShare, FaPaperclip, FaDownload, FaExternalLinkAlt, FaStar, FaRegStar } from "react-icons/fa";
import { SiGmail } from "react-icons/si";
import { type EmailData } from "@/types/index";
import { useToast } from "@/contexts/toast-context";

// --- CẤU HÌNH API ---
// Thay thế đường dẫn này bằng URL backend thực tế của bạn
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface MailContentProps {
  mail?: EmailData | null;
  onBack?: () => void;
  onForwardClick?: () => void;
  onReplyClick?: () => void;
  onDelete?: (mailId: string) => void;
  onArchive?: (mailId: string) => void;
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

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

const MailContent = ({
  mail,
  onBack,
  onForwardClick,
  onReplyClick,
  onDelete,
  onArchive,
  triggerReply,
}: MailContentProps) => {
  const { showToast } = useToast();
  const [isReplying, setIsReplying] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isStarring, setIsStarring] = useState(false);
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

  // --- DOWNLOAD ATTACHMENT FUNCTION ---
  const handleDownloadAttachment = async (
    attachmentId: string,
    filename: string
  ) => {
    try {
      // Get Token
      const token = typeof window !== "undefined" ? window.__accessToken : null;
      if (!token) {
        alert("Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.");
        return;
      }

      // Call API
      const response = await fetch(
        `${API_BASE_URL}/attachments/${mail.id}/${attachmentId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to download attachment");
      }

      // Download file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Error downloading attachment:", error);
      alert(`Error: ${error.message}`);
    }
  };

  // --- ARCHIVE EMAIL FUNCTION ---
  const handleArchive = async () => {
    if (!mail?.id) return;

    setIsArchiving(true);

    try {
      // Get Token
      const token = typeof window !== "undefined" ? window.__accessToken : null;
      if (!token) {
        alert("Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.");
        setIsArchiving(false);
        return;
      }

      // Call API
      const response = await fetch(`${API_BASE_URL}/emails/${mail.id}/modify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "archive",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to archive email");
      }

      // Success - call parent callback
      if (onArchive) {
        onArchive(mail.id);
      }

      showToast("Email archived successfully", "success");

      // Go back to list
      if (onBack) {
        onBack();
      }
    } catch (error: any) {
      console.error("Error archiving email:", error);
      showToast(`Failed to archive: ${error.message}`, "error");
    } finally {
      setIsArchiving(false);
    }
  };

  // --- MOVE TO INBOX FUNCTION (UNARCHIVE) ---
  const handleMoveToInbox = async () => {
    if (!mail?.id) return;

    setIsArchiving(true);

    try {
      // Get Token
      const token = typeof window !== "undefined" ? window.__accessToken : null;
      if (!token) {
        alert("Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.");
        setIsArchiving(false);
        return;
      }

      // Call API
      const response = await fetch(`${API_BASE_URL}/emails/${mail.id}/modify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "unarchive",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to move to inbox");
      }

      // Success - call parent callback
      if (onArchive) {
        onArchive(mail.id);
      }

      showToast("Email moved to inbox successfully", "success");

      // Go back to list
      if (onBack) {
        onBack();
      }
    } catch (error: any) {
      console.error("Error moving to inbox:", error);
      showToast(`Failed to move to inbox: ${error.message}`, "error");
    } finally {
      setIsArchiving(false);
    }
  };

  // --- TOGGLE STAR FUNCTION ---
  const handleToggleStar = async () => {
    if (!mail?.id) return;

    setIsStarring(true);
    const isCurrentlyStarred = mail.labelIds?.includes("STARRED");
    const action = isCurrentlyStarred ? "unstar" : "star";

    try {
      // Get Token
      const token = typeof window !== "undefined" ? window.__accessToken : null;
      if (!token) {
        alert("Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.");
        setIsStarring(false);
        return;
      }

      // Call API
      const response = await fetch(`${API_BASE_URL}/emails/${mail.id}/modify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to ${action} email`);
      }

      // Update local state optimistically
      if (mail.labelIds) {
        if (isCurrentlyStarred) {
          mail.labelIds = mail.labelIds.filter(id => id !== "STARRED");
        } else {
          mail.labelIds.push("STARRED");
        }
      }

      showToast(
        isCurrentlyStarred ? "Star removed" : "Email starred",
        "success"
      );
    } catch (error: any) {
      console.error("Error toggling star:", error);
      showToast(`Failed to ${action}: ${error.message}`, "error");
    } finally {
      setIsStarring(false);
    }
  };

  // --- DELETE EMAIL FUNCTION ---
  const handleDelete = async () => {
    if (!mail?.id) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this email? It will be moved to Trash."
    );
    if (!confirmed) return;

    setIsDeleting(true);

    try {
      // Get Token
      const token = typeof window !== "undefined" ? window.__accessToken : null;
      if (!token) {
        alert("Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.");
        setIsDeleting(false);
        return;
      }

      // Call API
      const response = await fetch(`${API_BASE_URL}/emails/${mail.id}/modify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "delete",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete email");
      }

      // Success - call parent callback
      if (onDelete) {
        onDelete(mail.id);
      }

      showToast("Email moved to trash", "success");

      // Go back to list
      if (onBack) {
        onBack();
      }
    } catch (error: any) {
      console.error("Error deleting email:", error);
      showToast(`Failed to delete: ${error.message}`, "error");
    } finally {
      setIsDeleting(false);
    }
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
      showToast("Reply sent successfully", "success");
    } catch (error: any) {
      console.error("Error sending reply:", error);
      showToast(`Failed to send reply: ${error.message}`, "error");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-background overflow-hidden relative isolate">
      {/* --- TOP ACTION BAR --- */}
      <div className="flex flex-row justify-between items-center p-3 border-b border-divider dark:border-gray-800 shrink-0 bg-background">
        <div className="flex items-center gap-4 text-secondary">
          <button
            className="hover:text-primary  hover:bg-muted rounded-md p-2 transition-colors cursor-pointer"
            onClick={onBack}
          >
            <IoMdClose size={20} />
          </button>
          <div className="h-4 w-px mx-2"></div>

          <button
            className="hover:text-foreground transition-colors md:hidden cursor-pointer"
            title="Back to Inbox"
            onClick={onBack}
          >
            <IoMdArrowBack size={20} />
          </button>

        </div>

        <div className="flex items-center gap-2 text-secondary">
          <a
            href={`https://mail.google.com/mail/u/0/#all/${mail.threadId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-muted rounded-md transition-colors hover:text-red-500 cursor-pointer"
            title="Open in Gmail"
          >
            <SiGmail size={18} />
          </a>
          <button
            onClick={handleToggleStar}
            disabled={isStarring}
            className="p-2 hover:bg-muted rounded-md transition-colors hover:text-yellow-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title={mail.labelIds?.includes("STARRED") ? "Remove star" : "Add star"}
          >
            {mail.labelIds?.includes("STARRED") ? (
              <FaStar size={18} className="text-yellow-500" />
            ) : (
              <FaRegStar size={18} />
            )}
          </button>
          {mail.labelIds?.includes("INBOX") ? (
            <button
              onClick={handleArchive}
              disabled={isArchiving}
              className="p-2 hover:bg-muted rounded-md transition-colors hover:text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Archive email"
            >
              <BsArchive size={18} />
            </button>
          ) : (
            <button
              onClick={handleMoveToInbox}
              disabled={isArchiving}
              className="p-2 hover:bg-muted rounded-md transition-colors hover:text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Move to inbox"
            >
              <BsInboxFill size={18} />
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 hover:bg-muted rounded-md transition-colors hover:text-red-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete email"
          >
            <BsTrash3 size={18} />
          </button>
        </div>
      </div>

      {/* --- SCROLLABLE CONTENT AREA --- */}
      <div className="flex-1 overflow-y-auto mailbox-scrollbar pb-20 text-secondary">
        {/* Subject and Sender Info - Unified Section */}
        <div className="px-6 pt-6 pb-4 bg-background border-b border-divider dark:border-gray-800">
          {/* Subject Header */}
          <div className="mb-4">
            <div className="flex flex-row justify-between items-start gap-4">
              <h1 className="text-xl md:text-2xl font-semibold text-foreground flex-1">
                {mail.subject || "(No Subject)"}
              </h1>
              <div className="flex gap-2 shrink-0">
                {mail.labelIds?.includes("SENT") && (
                  <span className="bg-muted text-xs px-2 py-1 rounded text-secondary">
                    Sent Mail
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Sender Info Row */}
          <div className="flex flex-row justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                {senderName.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">
                    {senderName}
                  </span>
                  <span className="text-xs text-secondary">
                    &lt;{senderEmail}&gt;
                  </span>
                </div>
                <span className="text-xs text-secondary">To: {mail.to}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-secondary text-sm">
              <a
                href={`https://mail.google.com/mail/u/0/#all/${mail.threadId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:flex items-center gap-1.5 hover:text-foreground hover:bg-muted px-2 py-1 rounded transition-colors text-xs font-medium"
                title="Open in Gmail"
              >
                <SiGmail size={14} />
                Open in Gmail
              </a>
              <span>{formatDate(mail.date)}</span>
              <button className="p-1 hover:bg-muted rounded hover:text-foreground cursor-pointer">
                <IoMdMore size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Original Mail Body */}
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
                        iframe.style.height = Math.max(height + 20, 200) + "px";
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

        {/* --- ATTACHMENTS SECTION --- */}
        {mail.attachments && mail.attachments.length > 0 && (
          <div className="px-6 pb-6">
            <div className="border border-divider dark:border-gray-800 rounded-lg overflow-hidden bg-muted/30">
              <div className="px-4 py-3 border-b border-divider dark:border-gray-800 bg-muted/50">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <FaPaperclip className="text-secondary" />
                  <span>
                    {mail.attachments.length} Attachment
                    {mail.attachments.length > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <div className="p-4 space-y-2">
                {mail.attachments.map((attachment, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-background border border-divider dark:border-gray-800 rounded-md hover:border-primary/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <FaPaperclip
                          className="text-blue-600 dark:text-blue-400"
                          size={16}
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-foreground truncate">
                          {attachment.filename}
                        </span>
                        <span className="text-xs text-secondary">
                          {formatFileSize(attachment.size)} •{" "}
                          {attachment.mimeType}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        handleDownloadAttachment(
                          attachment.attachmentId,
                          attachment.filename
                        )
                      }
                      className="flex items-center gap-2 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors text-sm font-medium shrink-0"
                      title={`Download ${attachment.filename}`}
                    >
                      <FaDownload size={14} />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- REPLY EDITOR AREA --- */}
        {isReplying && (
          <div className="px-6 pb-6 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center gap-2 text-sm text-secondary mb-1">
              <FaReply /> Replying to{" "}
              <span className="text-foreground font-medium">{senderName}</span>
            </div>
            <textarea
              ref={replyTextareaRef}
              autoFocus
              className="w-full bg-background border border-divider dark:border-gray-700 rounded-md p-4 text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[150px] resize-y"
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
                className="px-4 py-2 hover:bg-muted text-secondary hover:text-foreground text-sm rounded transition-colors cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- BOTTOM ACTION BAR --- */}
      {!isReplying && (
        <div className="border-t border-divider dark:border-gray-800 p-4 flex flex-row gap-3 bg-background">
          <button
            onClick={handleReplyClick}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm rounded transition-colors cursor-pointer"
          >
            <FaReply /> Reply
          </button>
          <button
            onClick={onForwardClick}
            className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-sm rounded transition-colors cursor-pointer"
          >
            <FaShare /> Forward
          </button>
        </div>
      )}
    </div>
  );
};

export default MailContent;
