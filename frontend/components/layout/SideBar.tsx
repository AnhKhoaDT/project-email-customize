"use client";

import {
  FaPenToSquare,
  FaInbox,
  FaRegStar,
  FaBoxArchive,
  FaTrashCan,
  FaTag,
} from "react-icons/fa6";
import { LuSquareKanban } from "react-icons/lu";
import { IoSend, IoSettingsOutline } from "react-icons/io5";
import { IoIosArrowDown, IoIosArrowUp } from "react-icons/io";
import { RiErrorWarningFill } from "react-icons/ri";
import { MdLabelImportant } from "react-icons/md";
import ThemeSwitcher from "@/components/theme-switcher";
import LogoutButton from "@/components/logout-button";
import { User } from "@/types/auth.types";
import { type NavItem, Label } from "@/types";
import Link from "next/link"; // Import Link
import { usePathname } from "next/navigation"; // Import usePathname để check active link

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
export interface SideBarProps {
  user: User | null;
  navigation?: {
    core: NavItem[];
    management: NavItem[];
    labels: Label[];
  };
  onSelectLabel?: (labelId: string) => void;
  isExpanded: boolean;
  isKanbanMode: boolean;
  toggleSidebar: () => void;
  onComposeClick?: () => void;
  kanbanClick: () => void;
}

// Navigation config - sử dụng folder slug để khớp với dynamic route
const nav = {
  core: [
    { title: "Inbox", path: "/inbox", icon: FaInbox },
    { title: "Starred", path: "/starred", icon: FaRegStar },
    { title: "Important", path: "/important", icon: MdLabelImportant },
    { title: "Drafts", path: "/drafts", icon: FaPenToSquare },
    { title: "Sent", path: "/sent", icon: IoSend },
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
  onSelectLabel,
}: SideBarProps) => {
  // Mapping folder slug to Gmail Label ID (used to identify system folders)
  const FOLDER_MAP: Record<string, string> = {
    inbox: "INBOX",
    starred: "STARRED",
    important: "IMPORTANT",
    sent: "SENT",
    drafts: "DRAFT",
    spam: "SPAM",
    trash: "TRASH",
    archive: "ARCHIVE",
  };
  const pathname = usePathname(); // Lấy đường dẫn hiện tại (VD: /inbox)

  const slugify = (s?: string) =>
    (s || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "");

  // Mailbox labels from backend
  const [mailboxes, setMailboxes] = useState<Label[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const { accessToken, isAuthenticated, isAuthInitialized } = useAuth();

  // Set of system label IDs for quick lookup
  const systemIds = useMemo(() => new Set(Object.values(FOLDER_MAP)), []);

  useEffect(() => {
    let mounted = true;
    const fetchMailboxes = async () => {
      setLabelsLoading(true);
      setLabelsError(null);
      try {
        const apiURL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
        // Prefer context token, fall back to window.__accessToken for safety
        const token = accessToken || (typeof window !== "undefined" ? (window as any).__accessToken : null);
        if (!token) {
          // If auth not initialized yet, wait until it is; otherwise skip to avoid 401
          if (!isAuthInitialized) return;
          throw new Error("Not authenticated");
        }

        const res = await fetch(`${apiURL}/mailboxes`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch mailboxes");
        const data = await res.json();
        if (!mounted) return;
        setMailboxes(Array.isArray(data) ? data : []);
      } catch (err: any) {
        if (!mounted) return;
        console.error("Failed to load mailboxes", err);
        setLabelsError(err?.message || "Failed to load");
      } finally {
        if (mounted) setLabelsLoading(false);
      }
    };
    fetchMailboxes();
    return () => {
      mounted = false;
    };
  }, [systemIds, accessToken, isAuthInitialized]);

  // Custom labels (exclude system labels and certain unwanted labels)
  const excludeLabelIds = useMemo(() => new Set(["YELLOW_STAR", "UNREAD"]), []);
  const customLabels = useMemo(
    () =>
      mailboxes.filter((l) => {
        if (systemIds.has(l.id)) return false;
        if (excludeLabelIds.has(l.id)) return false;
        const nameKey = (l.name || "").toLowerCase().replace(/\s+/g, "_");
        if (nameKey === "yellow_star" || nameKey === "unread") return false;
        return true;
      }),
    [mailboxes, systemIds, excludeLabelIds]
  );
  const [labelsOpen, setLabelsOpen] = useState(true);

  // Class chung cho các item
  const itemClass = `cursor-pointer flex flex-row items-center ${isExpanded ? "justify-between px-2" : "justify-center"
    } h-10 rounded-md transition-all duration-200`;

  // Get user display data
  const userName = user?.name || user?.email?.split("@")[0] || "User";
  const userEmail = user?.email || "user@example.com";
  const userInitial = userName.charAt(0).toUpperCase();

  // Hàm render item để tái sử dụng
  const renderNavItem = (item: any) => {
    const Icon = item.icon;
    // Kiểm tra active: pathname trùng với item.path
    // Hoặc pathname là "/" thì active tại "/inbox"
    const isActive =
      pathname === item.path || (item.path === "/inbox" && pathname === "/");

    return (
      <Link
        key={item.title}
        href={item.path}
        className={`
          ${itemClass}
          ${isActive
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
        {/* Badge count - có thể thêm logic hiển thị unread count */}
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
            ${isExpanded
            ? "translate-x-0 w-64"
            : "-translate-x-full w-64 md:translate-x-0"
          }
        `}
      >
        <div className={`px-4 flex flex-col overflow-auto flex-1 hide-scrollbar ${!isExpanded && "items-center"}`}>
          {/* User Container */}
          <div
            className={`flex flex-row items-center gap-2 ${isExpanded ? "" : "justify-center"
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
              ${isExpanded
                ? "px-4 w-full justify-start"
                : "justify-center w-10 px-0"
              }
            `}
          >
            <div className="flex items-center justify-center">
              <FaPenToSquare size={16} />
            </div>
            {isExpanded && (
              <span className="whitespace-nowrap font-medium p-3">New email</span>
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

          {/* Custom Labels (fetched from backend) */}
          <div className="flex flex-col mt-6 gap-2">
            {isExpanded && (
              <div className="flex items-center justify-between px-2">
                <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">
                  Labels
                </p>
                <button
                  onClick={() => setLabelsOpen((s) => !s)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center"
                  aria-expanded={labelsOpen}
                  aria-label={labelsOpen ? "Collapse labels" : "Expand labels"}
                >
                  {labelsOpen ? (
                    <IoIosArrowUp size={14} />
                  ) : (
                    <IoIosArrowDown size={14} />
                  )}
                </button>
              </div>
            )}
            <div className="flex flex-col gap-1">
              {labelsOpen && customLabels.map((label) => {
                const displaySlug = (label.name && label.name.trim().length > 0) ? label.name : label.id;
                const labelPath = `/${encodeURIComponent(displaySlug)}`;
                const isActiveLabel = pathname === labelPath;

                const labelContent = (
                  <div
                    className={`${itemClass} ${
                      isActiveLabel ? "bg-primary/20 text-primary font-medium" : "hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-center">
                      <FaTag className={isExpanded ? "mr-2" : ""} size={isExpanded ? 14 : 20} />
                      {isExpanded && <span className="truncate">{label.name}</span>}
                    </div>
                    {isExpanded && isActiveLabel && <span className="text-xs">&nbsp;</span>}
                  </div>
                );

                if (onSelectLabel) {
                  return (
                    <button
                      key={label.id}
                      onClick={() => {
                        if (isKanbanMode) kanbanClick();
                        onSelectLabel(label.id);
                      }}
                      className="w-full text-left"
                      aria-label={label.name}
                    >
                      {labelContent}
                    </button>
                  );
                }

                return (
                  <Link
                    key={label.id}
                    href={labelPath}
                    onClick={() => {
                      if (isKanbanMode) kanbanClick();
                    }}
                  >
                    {labelContent}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`flex flex-col px-4 pb-4 flex-shrink-0 ${!isExpanded && "items-center"}`}
        >
          <div className="w-full border-t border-border mb-2" />
          {/* Settings - Example Link */}
          <Link
            href="/settings"
            onClick={(e) => e.preventDefault()}
            aria-disabled="true"
            className={`cursor-pointer flex flex-row items-center rounded-sm px-2 hover:bg-muted/50
             ${isExpanded ? "justify-start gap-2" : "justify-center"
              } py-2 mb-1 text-foreground`}
          >
            <IoSettingsOutline size={20} />
            {isExpanded && <span>Settings</span>}
          </Link>

          {/* Kanban Toggle */}
          <button
            className={`cursor-pointer flex flex-row items-center rounded-sm px-2 
              ${isExpanded ? "justify-start gap-2" : "justify-center"}
              ${isKanbanMode
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
            className={`mt-4 flex items-center ${isExpanded ? "flex-row justify-between gap-2" : "flex-col gap-3"
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
      <style jsx>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </>
  );
};
export default SideBar;
