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
import LogoutButton from "@/components/logout-button";
import { User } from "@/types/auth.types";

import { type NavItem, Label } from "@/types";

export interface SideBarProps {
  user: User | null;
  navigation?: {
    core: NavItem[];
    management: NavItem[];
    labels: Label[];
  };
  isExpanded: boolean; // Prop mới
  toggleSidebar: () => void; // Prop mới (dùng cho mobile để đóng)
  onComposeClick?: () => void; // Handler for New email button
}

const nav = {
  core: [
    { title: "Inbox", path: "/inbox", icon: FaInbox, isActive: true },
    {
      title: "Favorites",
      path: "/favorites",
      icon: FaRegStar,
      isActive: false,
    },
    { title: "Drafts", path: "/drafts", icon: FaPenToSquare, isActive: false },
    { title: "Send", path: "/send", icon: IoSend, isActive: false },
  ],
  management: [
    { title: "Archive", path: "/archive", icon: FaBoxArchive, isActive: false },
    { title: "Spam", path: "/spam", icon: RiErrorWarningFill, isActive: false },
    { title: "Trash", path: "/trash", icon: FaTrashCan, isActive: false },
    {
      title: "Settings",
      path: "/settings",
      icon: IoSettingsOutline,
      isActive: false,
    },
  ],
  labels: [
    { id: "1", name: "Work", color: "red" },
    { id: "2", name: "Personal", color: "blue" },
  ],
};

const SideBar = ({
  user,
  isExpanded,
  navigation = nav,
  toggleSidebar,
  onComposeClick,
}: SideBarProps) => {
  // Class chung cho các item
  const itemClass = `cursor-pointer flex flex-row items-center ${
    isExpanded ? "justify-between px-2" : "justify-center"
  } h-10 hover:bg-muted/50 rounded-md transition-all duration-200`;

  // Get user display data
  const userName = user?.name || user?.email?.split("@")[0] || "User";
  const userEmail = user?.email || "user@example.com";
  const userInitial = userName.charAt(0).toUpperCase();

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
            className={`flex flex-row  items-center gap-2 ${
              isExpanded ? "justify-between" : "justify-center"
            } w-full`}
          >
            <div className="flex flex-row items-center gap-2">
              <div className="w-8 h-8 rounded-sm bg-muted border border-primary flex items-center justify-center shrink-0">
                <p>{userInitial}</p>
              </div>
            </div>
            {isExpanded && (
              <div
                className={`flex flex-col  gap-px overflow-hidden align-middle h-fit  ${
                  isExpanded
                    ? "opacity-100 max-h-20"
                    : "opacity-0 max-h-0 md:hidden"
                }`}
              >
                <span className="whitespace-nowrap">{userName}</span>
                <span className="text-secondary text-base truncate">
                  {userEmail}
                </span>
              </div>
            )}
          </div>

          {/* User Info Text */}

          {/* Create Mail Button */}
          <button
            onClick={onComposeClick}
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
              {
                /* Sử dụng lại itemClass cho đồng nhất */

                nav.core.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className={`cursor-pointer flex flex-row items-center ${
                        isExpanded ? "justify-between px-2" : "justify-center"
                      }
                        ${item.isActive ? "bg-primary/20" : "hover:bg-muted/50"}
                       h-10 hover:bg-muted/50 rounded-md transition-all duration-200`}
                    >
                      <div className="flex items-center justify-center">
                        <Icon
                          className={isExpanded ? "mr-2" : ""}
                          size={isExpanded ? 14 : 20}
                        />
                        {isExpanded && <span>{item.title}</span>}
                      </div>
                      {/* {isExpanded && (
                        <span className="text-secondary text-sm">3</span>
                      )} */}
                    </div>
                  );
                })
              }
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

          <div
            className={`mt-4 flex items-center ${
              isExpanded ? "flex-row justify-between gap-2" : "flex-col gap-3"
            }`}
          >
            <ThemeSwitcher />
            <LogoutButton
              showText={isExpanded}
              size={isExpanded ? "default" : "icon"}
            />
          </div>
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
