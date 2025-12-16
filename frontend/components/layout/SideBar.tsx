"use client";

import {
  FaPenToSquare,
  FaInbox,
  FaRegStar,
  FaBoxArchive,
  FaTrashCan,
} from "react-icons/fa6";
import { LuSquareKanban } from "react-icons/lu";
import { IoSend, IoSettingsOutline } from "react-icons/io5";
import { RiErrorWarningFill } from "react-icons/ri";
import ThemeSwitcher from "@/components/theme-switcher";
import LogoutButton from "@/components/logout-button";
import { User } from "@/types/auth.types";
import { type NavItem, Label } from "@/types";
import Link from "next/link"; // Import Link
import { usePathname } from "next/navigation"; // Import usePathname để check active link

export interface SideBarProps {
  user: User | null;
  navigation?: {
    core: NavItem[];
    management: NavItem[];
    labels: Label[];
  };
  isExpanded: boolean;
  isKanbanMode: boolean;
  toggleSidebar: () => void;
  onComposeClick?: () => void;
  kanbanClick: () => void;
}

// Bỏ thuộc tính isActive cứng, chúng ta sẽ tính toán nó
const nav = {
  core: [
    { title: "Inbox", path: "/inbox", icon: FaInbox },
    { title: "Favorites", path: "/favorites", icon: FaRegStar },
    { title: "Drafts", path: "/drafts", icon: FaPenToSquare },
    { title: "Send", path: "/send", icon: IoSend },
  ],
  management: [
    { title: "Archive", path: "/archive", icon: FaBoxArchive },
    { title: "Spam", path: "/spam", icon: RiErrorWarningFill },
    { title: "Trash", path: "/trash", icon: FaTrashCan },
  ],
  labels: [
    { id: "1", name: "Work", color: "red" },
    { id: "2", name: "Personal", color: "blue" },
  ],
};

const SideBar = ({
  user,
  isExpanded,
  navigation = nav, // Mặc định dùng nav ở trên
  isKanbanMode,
  toggleSidebar,
  onComposeClick,
  kanbanClick,
}: SideBarProps) => {
  const pathname = usePathname(); // Lấy đường dẫn hiện tại (VD: /inbox)

  // Class chung cho các item
  const itemClass = `cursor-pointer flex flex-row items-center ${
    isExpanded ? "justify-between px-2" : "justify-center"
  } h-10 rounded-md transition-all duration-200`;

  // Get user display data
  const userName = user?.name || user?.email?.split("@")[0] || "User";
  const userEmail = user?.email || "user@example.com";
  const userInitial = userName.charAt(0).toUpperCase();

  // Hàm render item để tái sử dụng
  const renderNavItem = (item: any) => {
    const Icon = item.icon;
    // Kiểm tra xem path hiện tại có trùng với item.path không
    // Hoặc item.path là '/' và pathname cũng là '/'
    const isActive =
      pathname === item.path || (item.path === "/inbox" && pathname === "/");

    return (
      <Link
        key={item.title}
        href={item.path}
        className={`
          ${itemClass}
          ${
            isActive
              ? "bg-primary/20 text-primary font-medium"
              : "hover:bg-muted/50 text-foreground"
          }
        `}
        onClick={() => {
          // Nếu trên mobile và sidebar đang mở, đóng nó khi click vào link
          if (isKanbanMode) {
            kanbanClick();
          }
        }}
      >
        <div className="flex items-center justify-center">
          <Icon
            className={isExpanded ? "mr-2" : ""}
            size={isExpanded ? 14 : 20}
          />
          {isExpanded && <span>{item.title}</span>}
        </div>
        {/* Badge count example - có thể thêm logic hiển thị số lượng mail chưa đọc ở đây */}
        {/* {isExpanded && isActive && <span className="text-xs">3</span>} */}
      </Link>
    );
  };

  return (
    <>
      {/* Sidebar Container */}
      <div
        className={`
            flex flex-col h-full bg-background text-foreground py-4 justify-between 
            transition-all duration-300 ease-in-out border-r border-border
            ${isExpanded ? "md:w-64" : "md:w-20"}
            ${"fixed md:relative z-50 h-full"}
            ${
              isExpanded
                ? "translate-x-0 w-64"
                : "-translate-x-full w-64 md:translate-x-0"
            }
        `}
      >
        <div className={`px-4 flex flex-col ${!isExpanded && "items-center"}`}>
          {/* User Container */}
          <div
            className={`flex flex-row items-center gap-2 ${
              isExpanded ? "" : "justify-center"
            } w-full`}
          >
            <div className="flex flex-row items-center gap-2">
              <div className="w-8 h-8 rounded-sm bg-muted border border-primary flex items-center justify-center shrink-0">
                <p className="font-semibold">{userInitial}</p>
              </div>
            </div>
            {isExpanded && (
              <div className="flex flex-col gap-px overflow-hidden align-middle h-fit opacity-100 max-h-20">
                <span className="whitespace-nowrap font-medium text-sm">
                  {userName}
                </span>
                <span
                  className="text-muted-foreground text-xs truncate max-w-[150px]"
                  title={userEmail}
                >
                  {userEmail}
                </span>
              </div>
            )}
          </div>

          {/* Create Mail Button */}
          <button
            onClick={onComposeClick}
            className={`mt-6 flex flex-row items-center gap-2 h-10 bg-primary text-primary-foreground rounded-md cursor-pointer hover:bg-primary/90 transition-all shadow-sm
              ${
                isExpanded
                  ? "px-4 w-full justify-start"
                  : "justify-center w-10 px-0"
              }
            `}
          >
            <div className="flex items-center justify-center">
              <FaPenToSquare size={16} />
            </div>
            {isExpanded && (
              <span className="whitespace-nowrap font-medium">New email</span>
            )}
          </button>

          {/* Core Menu */}
          <div className="flex flex-col mt-6 gap-2">
            {isExpanded && (
              <span className="text-muted-foreground font-semibold text-xs px-2 uppercase tracking-wider">
                Menu
              </span>
            )}
            <div className="flex flex-col gap-1">
              {navigation.core.map((item) => renderNavItem(item))}
            </div>
          </div>

          {/* Management Menu */}
          <div className="flex flex-col mt-6 gap-2">
            {isExpanded && (
              <p className="text-muted-foreground font-semibold text-xs px-2 uppercase tracking-wider">
                Management
              </p>
            )}
            <div className="flex flex-col gap-1">
              {navigation.management.map((item) => renderNavItem(item))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`flex flex-col px-4 pb-4 ${!isExpanded && "items-center"}`}
        >
          {/* Settings - Example Link */}
          <Link
            href="/settings"
            className={`cursor-pointer flex flex-row items-center rounded-sm px-2 hover:bg-muted/50
             ${
               isExpanded ? "justify-start gap-2" : "justify-center"
             } py-2 mb-1 text-foreground`}
          >
            <IoSettingsOutline size={20} />
            {isExpanded && <span>Settings</span>}
          </Link>

          {/* Kanban Toggle */}
          <button
            className={`cursor-pointer flex flex-row items-center rounded-sm px-2 
              ${isExpanded ? "justify-start gap-2" : "justify-center"}
              ${
                isKanbanMode
                  ? "bg-primary/20 text-primary"
                  : "hover:bg-muted/50 text-foreground"
              }
             py-2`}
            onClick={kanbanClick}
          >
            <LuSquareKanban size={18} />
            {isExpanded && <span>Kanban Board</span>}
          </button>

          <div
            className={`mt-4 flex items-center ${
              isExpanded ? "flex-row justify-between gap-2" : "flex-col gap-3"
            }`}
          >
            <ThemeSwitcher />
            <LogoutButton
              showText={false} // Chỉ hiện icon để gọn
              variant="ghost"
              size="icon"
            />
          </div>
        </div>
      </div>

      {/* Mobile Overlay */}
      {isExpanded && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={toggleSidebar}
        ></div>
      )}
    </>
  );
};
export default SideBar;
