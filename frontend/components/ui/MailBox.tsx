import { TbLayoutSidebarRightExpandFilled } from "react-icons/tb";
// ... import khác giữ nguyên ...
import { BsFillLightningChargeFill } from "react-icons/bs";
import { FaSearch, FaUserAlt, FaBell, FaTag } from "react-icons/fa";
import { IoWarning } from "react-icons/io5";
import { Mail } from "@/types";
import { useEffect, useRef } from "react";

interface MailBoxProps {
  toggleSidebar: () => void;
  selectedMail?: Mail | null;
  mails: Mail[];
  onSelectMail: (mail: Mail) => void;
  focusedIndex?: number;
}

const MailBox = ({
  toggleSidebar,
  selectedMail,
  mails,
  onSelectMail,
  focusedIndex = 0,
}: MailBoxProps) => {
  // Ref to track focused mail item for scroll-into-view
  const focusedItemRef = useRef<HTMLDivElement | null>(null);

  // Scroll focused item into view when focusedIndex changes
  useEffect(() => {
    if (focusedItemRef.current) {
      focusedItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [focusedIndex]);

  // UPDATE 1: Đổi w-1/3 thành w-full.
  // Parent (Home) sẽ bọc component này trong một thẻ div có width responsive.
  return (
    <div className="flex flex-col w-full bg-background border-x border-amber-50/50 h-full overflow-y-auto scrollbar-hide">
      {/* ... (Phần Header, Search, Filter Buttons giữ nguyên) ... */}
      <div className="flex flex-row justify-between p-5 sticky top-0 bg-background z-10">
        <div className="flex flex-row items-center gap-2">
          <button
            onClick={toggleSidebar}
            className="flex justify-center items-center h-8 w-8 hover:bg-secondary/10 rounded-md transition-colors cursor-pointer"
          >
            <TbLayoutSidebarRightExpandFilled size={20} className="" />
          </button>
          <h1 className="text-base font-semibold">Inbox</h1>
        </div>
      </div>
      <div className="w-full bg-secondary h-px opacity-30"></div>

      <main className="p-5 ">
        {/* Search */}
        <div className="flex flex-row items-center justify-center gap-3 p-2 rounded-md bg-background/70 border border-secondary focus-within:ring-1 ring-primary transition-all">
          <FaSearch className="text-gray-400" />
          <input
            type="text"
            placeholder="Search"
            className="w-full focus:outline-none placeholder-secondary bg-transparent"
          />
        </div>

        {/* Filter Buttons (Giữ nguyên) */}
        <div className="flex flex-row gap-2 mt-4 h-9 overflow-x-auto pb-1 scrollbar-hide">
          {/* ... buttons ... */}
          <button className="flex flex-row items-center px-4 gap-2 bg-primary rounded-md justify-center text-white shrink-0 hover:bg-primary/90 cursor-pointer">
            <BsFillLightningChargeFill />
            <span>Primary</span>
          </button>
          {/* ... các button khác giữ nguyên ... */}
        </div>

        {/* Mail List */}
        <div className="mt-8">
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
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="#CCCCCC"
                        width="100px"
                        height="100px"
                        className="w-10 h-10 rounded-full mr-4 shrink-0 object-cover"
                      >
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg>
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
              <div className="text-center text-secondary text-sm mt-5">
                No mails found.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default MailBox;
