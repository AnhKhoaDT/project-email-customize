"use client";

import { useState, useEffect } from "react";
import SideBar from "@/components/layout/SideBar";
import MailBox from "@/components/ui/MailBox";
import MailContent from "@/components/ui/MailContent";
import { type Mail } from "@/types";
import { mockMails } from "@/mockDatas/index";

export default function Home() {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);

  const toggleSidebar = () => {
    setIsSidebarExpanded((prev) => !prev);
  };

  const [selectedMail, setSelectedMail] = useState<Mail | null>(null);

  const fetchMailBox = () => {
    return mockMails;
  };
  const mails = fetchMailBox();

  // Tùy chọn: Auto select trên desktop, nhưng trên mobile thì không nên auto select ngay
  // để người dùng thấy danh sách trước.
  useEffect(() => {
    const isDesktop = window.innerWidth >= 768; // logic đơn giản check màn hình
    if (isDesktop && mails && mails.length > 0 && !selectedMail) {
      setSelectedMail(mails[0]);
    }
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <SideBar
        user={["A", "B"]}
        isExpanded={isSidebarExpanded}
        toggleSidebar={toggleSidebar}
      />

      <main className="flex flex-1 h-full w-full relative">
        {/* LOGIC RESPONSIVE:
            1. MailBox (Danh sách):
               - Mobile: Ẩn khi đã chọn mail (hidden), hiện khi chưa chọn (flex).
               - Desktop (md): Luôn hiện (md:flex) và chiếm 1/3 chiều rộng (md:w-1/3).
        */}
        <div
          className={`
            h-full 
            ${selectedMail ? "hidden" : "flex"} 
            md:flex md:w-1/3 w-full
          `}
        >
          <MailBox
            toggleSidebar={toggleSidebar}
            mails={mails}
            selectedMail={selectedMail}
            onSelectMail={setSelectedMail}
          />
        </div>

        {/* LOGIC RESPONSIVE:
            2. MailContent (Nội dung):
               - Mobile: Hiện khi đã chọn mail (flex), ẩn khi chưa chọn (hidden).
               - Desktop (md): Luôn hiện (md:flex) và chiếm 2/3 chiều rộng (md:w-2/3).
        */}
        <div
          className={`
            h-full 
            ${selectedMail ? "flex" : "hidden"} 
            md:flex md:w-2/3 w-full
          `}
        >
          <MailContent
            mail={selectedMail}
            // Khi bấm nút Back (trên mobile), reset state để quay về danh sách
            onBack={() => setSelectedMail(null)}
          />
        </div>
      </main>
    </div>
  );
}
