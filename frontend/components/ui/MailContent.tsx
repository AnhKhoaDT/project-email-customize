import { CiMail } from "react-icons/ci";
import {
  IoMdArrowBack,
  IoMdArrowForward,
  IoMdClose,
  IoMdMore,
} from "react-icons/io";
import { BsArchive, BsTrash3 } from "react-icons/bs";
import { FaReply, FaShare } from "react-icons/fa";

import { Mail } from "@/types";

interface MailContentProps {
  mail?: Mail | null; // Sửa MailData thành Mail
  onBack?: () => void;
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

const MailContent = ({ mail, onBack }: MailContentProps) => {
  // UPDATE 2: Sửa w-2/3 thành w-full để parent (Home) điều khiển kích thước
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

  // UPDATE 3: Sửa w-2/3 thành w-full. Parent sẽ chia cột.
  return (
    <div className="flex flex-col w-full h-full bg-[#121212] text-gray-200 overflow-hidden relative">
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

          {/* UPDATE 4: Gắn sự kiện onBack vào nút mũi tên quay lại */}
          <button
            className="hover:text-white transition-colors md:hidden cursor-pointer" // Chỉ hiện thị nút Back rõ ràng trên mobile nếu muốn, hoặc để luôn hiện
            title="Back to Inbox"
          >
            <IoMdArrowBack size={20} />
          </button>

          {/* Giữ lại nút Forward */}
          <button className="hover:text-white transition-colors cursor-pointer">
            <IoMdArrowForward size={20} />
          </button>
        </div>

        {/* ... (Phần Action bên phải giữ nguyên) ... */}
        <div className="flex items-center gap-2 text-gray-400">
          <button className="p-2 hover:bg-white/10 rounded-md transition-colors cursor-pointer">
            <BsArchive size={18} />
          </button>
          <button className="p-2 hover:bg-white/10 rounded-md transition-colors hover:text-red-400 cursor-pointer">
            <BsTrash3 size={18} />
          </button>
        </div>
      </div>

      {/* ... (Phần SCROLLABLE CONTENT AREA giữ nguyên toàn bộ logic hiển thị mail) ... */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
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

        {/* Dynamic Body */}
        <div className="w-full bg-background text-secondary rounded-sm p-8 shadow-sm min-h-[200px] overflow-hidden">
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
        <div className="h-20"></div>
      </div>

      {/* --- BOTTOM ACTION BAR --- */}
      <div className="absolute bottom-6 left-6 flex flex-row gap-3">
        <button className="flex items-center gap-2 px-4 py-2 bg-[#2c2c2c] hover:bg-[#383838] text-gray-200 text-sm rounded border border-white/10 transition-colors cursor-pointer">
          <FaReply /> Reply
        </button>
        <button className="flex items-center gap-2 px-4 py-2 bg-[#2c2c2c] hover:bg-[#383838] text-gray-200 text-sm rounded border border-white/10 transition-colors cursor-pointer">
          <FaShare /> Forward
        </button>
      </div>
    </div>
  );
};

export default MailContent;
