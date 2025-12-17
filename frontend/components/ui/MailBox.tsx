import { TbLayoutSidebarRightExpandFilled } from "react-icons/tb";
// ... import khác giữ nguyên ...
import { BsFillLightningChargeFill } from "react-icons/bs";
import { FaSearch, FaUserAlt, FaBell, FaTag } from "react-icons/fa";
import { LuSquareKanban } from "react-icons/lu";

import { IoWarning } from "react-icons/io5";
import { Mail } from "@/types";
import { EmailData } from "@/types";
import { useEffect, useRef, useState, KeyboardEvent } from "react";

interface MailBoxProps {
  toggleSidebar: () => void;
  selectedMail?: EmailData | null;
  mails: Mail[];
  onSelectMail: (mail: Mail) => void;
  focusedIndex?: number;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  kanbanMode: boolean;
  kanbanClick: () => void;
  // Search props
  searchQuery?: string;
  onSearch?: (query: string) => void;
  onClearSearch?: () => void;
  isSearching?: boolean;
  error?: string | null;
}

const MailBox = ({
  toggleSidebar,
  selectedMail,
  mails,
  onSelectMail,
  focusedIndex = 0,
  isLoadingMore = false,
  hasMore = true,
  kanbanMode = false,
  kanbanClick,
  searchQuery,
  onSearch,
  onClearSearch,
  isSearching = false,
  error = null,
}: MailBoxProps) => {
  // Ref to track focused mail item for scroll-into-view
  const focusedItemRef = useRef<HTMLDivElement | null>(null);
  
  // Local state for search input (to prevent parent re-renders on every keystroke)
  const [inputValue, setInputValue] = useState(searchQuery || "");
  
  // Update local input when searchQuery prop changes (e.g., from URL)
  useEffect(() => {
    setInputValue(searchQuery || "");
  }, [searchQuery]);

  // Scroll focused item into view when focusedIndex changes
  useEffect(() => {
    if (focusedItemRef.current) {
      focusedItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [focusedIndex]);
  
  // Handle search on Enter key
  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      onSearch?.(inputValue.trim());
    } else if (e.key === "Escape") {
      handleClearSearch();
    }
  };
  
  // Handle clear search
  const handleClearSearch = () => {
    setInputValue("");
    onClearSearch?.();
  };

  // UPDATE 1: Đổi w-1/3 thành w-full.
  // Parent (Home) sẽ bọc component này trong một thẻ div có width responsive.
  return (
    <div className="mailbox-scroll-container flex flex-col w- bg-background border-x border-amber-50/50 h-full overflow-hidden">
      {/* ... (Phần Header, Search, Filter Buttons giữ nguyên) ... */}
      <div className="flex flex-col justify-between p-5 sticky top-0 bg-background z-10">
        <div className="flex flex-row justify-between items-center">
          <div className="flex flex-row items-center gap-2">
            <button
              onClick={toggleSidebar}
              className="flex justify-center items-center h-8 w-8 hover:bg-secondary/10 rounded-md transition-colors cursor-pointer"
            >
              <TbLayoutSidebarRightExpandFilled size={20} className="" />
            </button>
            <h1 className="text-base font-semibold">
              {searchQuery ? `Search: "${searchQuery}"` : "Inbox"}
            </h1>
          </div>
          {/* kanban active/ unactive*/}
          <button
            onClick={kanbanClick}
            className={`flex justify-center items-center h-8 w-8  rounded-md transition-colors cursor-pointer ${
              kanbanMode ? "bg-primary/40 " : "hover:bg-secondary/60"
            }`}
          >
            <LuSquareKanban size={20} />
          </button>
        </div>
        {/* Search */}
        <div className="flex flex-row items-center mt-4 justify-center gap-3 p-2 rounded-md bg-background/70 border border-secondary focus-within:ring-1 ring-primary transition-all">
          <FaSearch className={isSearching ? "text-primary animate-pulse" : "text-gray-400"} />
          <input
            type="text"
            placeholder="Search emails... (Press Enter)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            disabled={isSearching}
            className="w-full focus:outline-none placeholder-secondary bg-transparent disabled:opacity-50"
          />
          {(inputValue || searchQuery) && (
            <button
              onClick={handleClearSearch}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Clear search (Esc)"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="w-full bg-secondary h-px opacity-30"></div>

      <main className="flex-1 p-5 overflow-y-auto mailbox-scrollbar mailbox-scroll-target">
        {/* Mail List */}
        <div className="">
          <div className="flex flex-col gap-2 ">
            {mails && mails.length > 0 ? (
              mails.map((mail, index) => {
                const isSelected = selectedMail?.id === mail.id;
                const isFocused = focusedIndex === index;

                return (
                  <div
                    key={mail.id}
                    ref={isFocused ? focusedItemRef : null}
                    onClick={() => onSelectMail(mail)}
                    draggable={true}
                    className={` 
                      flex flex-row justify-between items-start md:items-center p-3 rounded-md transition-all cursor-pointer border
                      ${
                        isSelected
                          ? "bg-primary/10 border-primary/50 shadow-sm"
                          : isFocused
                      }
                    `}
                  >
                    {/* ... (Nội dung từng item mail giữ nguyên) ... */}
                    <div className="flex items-start md:items-center w-full overflow-hidden">
                      {/* <img
                        src={
                          "https://avatar.iran.liara.run/username?username=" +
                          (mail.from || "someone")
                        }
                        alt="Avatar"
                        className="w-10 h-10 rounded-full mr-4 shrink-0 object-cover"
                      /> */}
                      {/* <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="#CCCCCC"
                        width="100px"
                        height="100px"
                        className="w-10 h-10 rounded-full mr-4 shrink-0 object-cover"
                      >
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg> */}
                      <div className="flex flex-col w-full min-w-0">
                        <div className="flex flex-row items-center justify-between">
                          <span
                            className={`mr-2 truncate text-secondary ${
                              isSelected
                                ? "font-bold text-foreground"
                                : "font-semibold"
                            }`}
                          >
                            {mail.from || "someone"}
                          </span>
                          <span className="text-secondary text-xs shrink-0">
                            {mail.date}
                          </span>
                        </div>
                        <div className="w-full">
                          <p className="text-sm truncate text-secondary">
                            {mail.subject || "No subject"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-sm mt-5">
                {error ? (
                  <span className="text-red-600 dark:text-red-400">{error}</span>
                ) : (
                  <span className="text-secondary">No mails found.</span>
                )}
              </div>
            )}

            {/* Loading More Indicator */}
            {isLoadingMore && (
              <div className="flex justify-center items-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span className="ml-2 text-sm text-secondary">
                  Loading more...
                </span>
              </div>
            )}

            {/* End of List Indicator */}
            {!hasMore && mails.length > 0 && (
              <div className="text-center text-secondary text-xs py-4">
                No more emails to load
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default MailBox;
