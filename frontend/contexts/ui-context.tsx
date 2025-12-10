"use client";

import React, { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";

interface UIContextType {
  isSidebarExpanded: boolean;
  toggleSidebar: () => void;
  isKanBanMode: boolean;
  toggleKanBanMode: () => void;
  isComposeOpen: boolean;
  setComposeOpen: (open: boolean) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);

  // State quản lý Kanban mode
  const [isKanBanMode, setIsKanBanMode] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarExpanded((prev) => !prev);

  // --- SỬA LỖI TẠI ĐÂY ---
  const toggleKanBanMode = () => {
    // 1. Tính toán giá trị mới dựa trên giá trị hiện tại
    const nextMode = !isKanBanMode;

    // 2. Cập nhật State
    setIsKanBanMode(nextMode);

    // 3. Thực hiện điều hướng (Side Effect) Ở NGOÀI hàm setState
    if (nextMode) {
      router.push("/kanban");
    } else {
      router.push("/inbox");
    }
  };

  return (
    <UIContext.Provider
      value={{
        isSidebarExpanded,
        toggleSidebar,
        isKanBanMode,
        toggleKanBanMode, // Truyền hàm đã sửa vào đây
        isComposeOpen,
        setComposeOpen: setIsComposeOpen,
      }}
    >
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error("useUI must be used within a UIProvider");
  }
  return context;
}
