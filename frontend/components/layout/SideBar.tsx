import {
  FaPenToSquare,
  FaInbox,
  FaRegStar,
  FaBoxArchive,
  FaTrashCan,
  FaMessage,
} from "react-icons/fa6";
import { IoSend, IoSettingsOutline } from "react-icons/io5";
import { RiErrorWarningFill } from "react-icons/ri";
import ThemeSwitcher from "@/components/theme-switcher";

export interface SideBarProps {
  user: string[];
  isExpanded: boolean; // Prop mới
  toggleSidebar: () => void; // Prop mới (dùng cho mobile để đóng)
}

const SideBar = ({ user, isExpanded, toggleSidebar }: SideBarProps) => {
  // Class chung cho các item
  const itemClass = `cursor-pointer flex flex-row items-center ${
    isExpanded ? "justify-between px-2" : "justify-center"
  } h-10 hover:bg-muted/50 rounded-md transition-all duration-200`;

  return (
    <>
      {/* Sidebar Container */}
      <div
        className={`
            flex flex-col h-full bg-background text-foreground py-4 justify-between 
            transition-all duration-300 ease-in-out
            ${/* Desktop Width */ isExpanded ? "md:w-64" : "md:w-20"}
            ${/* Mobile Position */ "fixed md:relative z-50 h-full"}
            ${
              /* Mobile Visibility */ isExpanded
                ? "translate-x-0 w-64"
                : "-translate-x-full w-64 md:translate-x-0"
            }
        `}
      >
        <div className={`px-4 flex flex-col ${!isExpanded && "items-center"}`}>
          {/* User Container */}
          <div
            className={`flex flex-row ${
              isExpanded ? "justify-between" : "justify-center"
            } items-center w-full`}
          >
            <div className="flex flex-row items-center gap-2">
              <div className="w-8 h-8 rounded-sm bg-muted border border-primary flex items-center justify-center shrink-0">
                <p>B</p>
              </div>
            </div>
            {isExpanded && (
              <div>
                <button className="cursor-pointer">•••</button>
              </div>
            )}
          </div>

          {/* User Info Text */}
          <div
            className={`flex flex-col mt-5 gap-0.5 overflow-hidden transition-all duration-300 ${
              isExpanded
                ? "opacity-100 max-h-20"
                : "opacity-0 max-h-0 md:hidden"
            }`}
          >
            <span className="whitespace-nowrap">Baked Design</span>
            <span className="text-secondary text-base truncate">
              work@baked.design
            </span>
          </div>

          {/* Create Mail Button */}
          <button
            className={`mt-6 flex flex-row items-center gap-2 h-10 bg-muted rounded-md cursor-pointer hover:bg-muted/80 transition-all
              ${
                isExpanded
                  ? "px-4 w-full justify-start"
                  : "justify-center w-10 px-0"
              }
            `}
          >
            <div className="flex items-center justify-center">
              <FaPenToSquare />
            </div>
            {isExpanded && <span className="whitespace-nowrap">New email</span>}
          </button>

          {/* Core Menu */}
          <div className="flex flex-col mt-6 gap-2">
            {isExpanded && (
              <span className="text-secondary font-semibold text-sm px-2">
                Core
              </span>
            )}
            <div className="flex flex-col gap-1">
              {/* Menu Item: Inbox */}
              <div className={itemClass}>
                <div className="flex items-center justify-center">
                  <FaInbox
                    className={isExpanded ? "mr-2" : ""}
                    size={isExpanded ? 14 : 20}
                  />
                  {isExpanded && <span>Inbox</span>}
                </div>
                {isExpanded && (
                  <span className="text-secondary text-sm">3</span>
                )}
              </div>

              {/* Menu Item: Favorites */}
              <div className={itemClass}>
                <div className="flex items-center justify-center">
                  <FaRegStar
                    className={isExpanded ? "mr-2" : ""}
                    size={isExpanded ? 14 : 20}
                  />
                  {isExpanded && <span>Favorites</span>}
                </div>
                {isExpanded && (
                  <span className="text-secondary text-sm">5</span>
                )}
              </div>

              <div className={itemClass}>
                <div className="flex items-center justify-center">
                  <FaPenToSquare
                    className={isExpanded ? "mr-2" : ""}
                    size={isExpanded ? 14 : 20}
                  />
                  {isExpanded && <span>Drafts</span>}
                </div>
                {isExpanded && (
                  <span className="text-secondary text-sm">2</span>
                )}
              </div>

              <div className={itemClass}>
                <div className="flex items-center justify-center">
                  <IoSend
                    className={isExpanded ? "mr-2" : ""}
                    size={isExpanded ? 14 : 20}
                  />
                  {isExpanded && <span>Send</span>}
                </div>
                {isExpanded && (
                  <span className="text-secondary text-sm">2</span>
                )}
              </div>
            </div>
          </div>

          {/* Management Menu */}
          <div className="flex flex-col mt-6 gap-2">
            {isExpanded && (
              <p className="text-secondary font-semibold text-sm px-2">
                Management
              </p>
            )}
            <div className="flex flex-col gap-1">
              <div className={itemClass}>
                <div className="flex items-center justify-center">
                  <FaBoxArchive
                    className={isExpanded ? "mr-2" : ""}
                    size={isExpanded ? 14 : 20}
                  />
                  {isExpanded && <span>Archive</span>}
                </div>
                {isExpanded && (
                  <span className="text-secondary text-sm">3</span>
                )}
              </div>

              {/* Other items... shorten for brevity but applying same logic */}
              <div className={itemClass}>
                <div className="flex items-center justify-center">
                  <FaTrashCan
                    className={isExpanded ? "mr-2" : ""}
                    size={isExpanded ? 14 : 20}
                  />
                  {isExpanded && <span>Bin</span>}
                </div>
                {isExpanded && (
                  <span className="text-secondary text-sm">2</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`flex flex-col px-4 pb-4 ${!isExpanded && "items-center"}`}
        >
          <button
            className={`cursor-pointer flex flex-row items-center ${
              isExpanded ? "justify-start gap-2" : "justify-center"
            } py-2`}
          >
            <IoSettingsOutline size={20} />
            {isExpanded && <span>Settings</span>}
          </button>
          <button
            className={`cursor-pointer flex flex-row items-center ${
              isExpanded ? "justify-start gap-2" : "justify-center"
            } py-2`}
          >
            <FaMessage size={18} />
            {isExpanded && <span>Help & Feedback</span>}
          </button>

          <div className="mt-4 flex justify-start items-center"><ThemeSwitcher /></div>

        </div>
      </div>

      {/* Mobile Overlay: Click outside to close */}
      {isExpanded && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={toggleSidebar}
        ></div>
      )}
    </>
  );
};
export default SideBar;
