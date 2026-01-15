import { useState, useEffect, useCallback, useRef } from "react";
import api, {
  fetchKanbanConfig,
  fetchColumnEmails,
  fetchInboxEmails,
  fetchSnoozedEmails,
  moveEmail,
  generateEmailSummary,
  snoozeEmail as snoozeEmailAPI,
  unsnoozeEmail as unsnoozeEmailAPI,
  deleteKanbanColumn,
  updateKanbanColumn,
} from "@/lib/api";

// --- TYPES ---
export interface KanbanEmail {
  id: string;
  threadId: string;
  sender: string;
  subject: string;
  snippet: string;
  summary?: string;
  from: string;
  to?: string; // Add to field
  date: string;
  time: string;
  avatar: string;
  color: string;
  status?: string;
  isSnoozed?: boolean;
  snoozedUntil?: string;
  isUnread: boolean;
  hasAttachment: boolean;
  labelIds?: string[]; // Add labelIds for checking SENT
  htmlBody?: string; // Add htmlBody for mail content
  textBody?: string; // Add textBody for mail content
}

// Thay đổi quan trọng: Column là một object trong mảng
export interface Column {
  id: string;
  title: string;
  isSystem: boolean;
  items: KanbanEmail[];
  color?: string;
  gmailLabel?: string;
  gmailLabelName?: string;
  hasLabelError?: boolean;
  labelErrorMessage?: string;
  labelErrorDetectedAt?: string;
  autoArchive?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

export const useKanbanData = () => {
  // Initial State: Mảng các cột mặc định
  const [columns, setColumns] = useState<Column[]>([
    { id: "inbox", title: "Inbox", isSystem: true, items: [], color: "#3b82f6" },
    { id: "todo", title: "To Do", isSystem: false, items: [], color: "#f97316" },
    { id: "done", title: "Done", isSystem: true, items: [], color: "#22c55e" },
    // Cột snoozed có thể ẩn hoặc hiện tùy logic, ở đây tôi tạm ẩn khỏi mảng chính
    // và xử lý logic riêng nếu cần, hoặc bạn có thể push vào đây nếu muốn hiện cột Snoozed
  ]);

  // Per-column loading states
  const [columnLoadingStates, setColumnLoadingStates] = useState<Record<string, boolean>>({});
  // Ref mirror to avoid stale closures when checking loading states inside callbacks
  const columnLoadingRef = useRef<Record<string, boolean>>({});

  // Chúng ta vẫn giữ state snoozed riêng để tính toán logic "đánh thức" email
  const [snoozedItems, setSnoozedItems] = useState<KanbanEmail[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- HELPER: Transform Data ---
  const transformEmail = (email: any): KanbanEmail => {
    const getSenderName = (fromStr: string) => {
      if (!fromStr) return "Unknown";
      const parts = fromStr.split("<");
      return parts[0].trim().replace(/"/g, "") || fromStr;
    };

    const getAvatar = (fromStr: string) => {
      const name = getSenderName(fromStr);
      return name.charAt(0).toUpperCase();
    };

    const getColor = () => {
      const colors = ["bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500", "bg-red-500"];
      return colors[Math.floor(Math.random() * colors.length)];
    };

    const formatTime = (dateStr: string) => {
      const date = new Date(dateStr);
      const now = new Date();
      const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
      if (diffHours < 1) return "Just now";
      if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
      if (diffHours < 48) return "Yesterday";
      return date.toLocaleDateString();
    };

    return {
      id: email.id,
      threadId: email.threadId,
      sender: getSenderName(email.from),
      subject: email.subject || "(No Subject)",
      snippet: email.snippet || "",
      summary: email.summary || email.snippet || "No summary available",
      from: email.from,
      date: email.date,
      time: formatTime(email.date),
      avatar: getAvatar(email.from),
      color: getColor(),
      status: email.status,
      isSnoozed: email.isSnoozed,
      snoozedUntil: email.snoozedUntil,
      isUnread: email.isUnread || false,
      hasAttachment: email.hasAttachment || false,
      labelIds: email.labelIds || [],
      htmlBody: email.htmlBody,
      textBody: email.textBody,
    };
  };

  // --- FETCH DATA ---
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 1. Fetch Kanban Config first (to get column list)
      const configRes = await fetchKanbanConfig();
      const backendColumns = configRes?.data?.columns || [];
      
      console.log('🔍 Backend columns received:', backendColumns);
      console.log('📊 Total columns:', backendColumns.length);
      backendColumns.forEach((col: any) => {
        console.log(`  - Column: "${col.name}" (id: ${col.id}, gmailLabel: ${col.gmailLabel})`);
      });

      // 2. Fetch snoozed emails
      const snoozedRes = await fetchSnoozedEmails().catch(() => ({ data: [] }));
      const snoozedRaw = snoozedRes?.data || [];
      setSnoozedItems(snoozedRaw.map(transformEmail));

      // 3. Build initial columns structure (empty items, will be loaded separately)
      const fixedInboxColumn: Column = {
        id: "inbox",
        title: "Inbox",
        isSystem: true,
        color: "#3b82f6",
        gmailLabel: "INBOX",
        items: [] // Will be fetched separately
      };

      const mappedBackendColumns: Column[] = backendColumns.map((col: any) => ({
        id: col.id,
        title: col.name,
        isSystem: col.isSystem || false,
        color: col.color || "#64748b",
        gmailLabel: col.gmailLabel,
        hasLabelError: col.hasLabelError,
        labelErrorMessage: col.labelErrorMessage,
        items: [] // Will be fetched separately
      }));

      // If backend has no columns, default to Inbox / To Do / Done
      let finalColumns: Column[];
      if (!backendColumns || backendColumns.length === 0) {
        console.log('🏗️ No backend columns found - creating defaults...');
        
        // Create default columns in backend
        try {
          // To Do → STARRED (system label, widely used)
          const todoRes = await api.post('/kanban/columns', {
            name: 'To Do',
            color: '#f97316',
            gmailLabel: 'STARRED',
            createNewLabel: false // STARRED already exists
          });
          
          // Done → custom "Done" label
          const doneRes = await api.post('/kanban/columns', {
            name: 'Done',
            color: '#22c55e',
            gmailLabel: 'Done',
            createNewLabel: true // Create new custom label
          });
          
          const todoData = todoRes?.data?.data || todoRes?.data;
          const doneData = doneRes?.data?.data || doneRes?.data;
          
          const defaultTodo: Column = {
            id: todoData?.id || 'todo',
            title: 'To Do',
            isSystem: false, // User can edit/delete
            color: '#f97316',
            gmailLabel: 'STARRED',
            items: []
          };
          
          const defaultDone: Column = {
            id: doneData?.id || 'done',
            title: 'Done',
            isSystem: false, // User can edit/delete
            color: '#22c55e',
            gmailLabel: doneData?.newLabelId || 'Done',
            gmailLabelName: 'Done',
            items: []
          };
          
          finalColumns = [fixedInboxColumn, defaultTodo, defaultDone];
          console.log('✅ Default columns created in backend');
        } catch (err: any) {
          console.error('❌ Failed to create default columns:', err);
          // Fallback to client-side only defaults
          const defaultTodo: Column = { id: "todo", title: "To Do", isSystem: false, color: "#f97316", gmailLabel: "STARRED", items: [] };
          const defaultDone: Column = { id: "done", title: "Done", isSystem: false, color: "#22c55e", gmailLabel: "Done", items: [] };
          finalColumns = [fixedInboxColumn, defaultTodo, defaultDone];
        }
      } else {
        finalColumns = [fixedInboxColumn, ...mappedBackendColumns];
      }
      setColumns(finalColumns);

      console.log('✅ Final columns structure:');
      finalColumns.forEach(col => {
        console.log(`  - ${col.title} (id: ${col.id}, gmailLabel: ${col.gmailLabel}, items: ${col.items.length})`);
      });

      setIsLoading(false);

      // 4. Fetch emails for each column separately (in background)
      // IMPORTANT: Fetch non-inbox columns FIRST, then inbox LAST
      // This ensures inbox filtering works correctly
      
      // 4a. Separate inbox from other columns
      const inboxColumn = finalColumns.find(c => c.id === "inbox");
      const nonInboxColumns = finalColumns.filter(c => c.id !== "inbox");
      
      console.log(`📋 Will fetch ${nonInboxColumns.length} non-inbox columns:`, nonInboxColumns.map(c => c.title));
      
      // 4b. Fetch all non-inbox columns in parallel FIRST
      await Promise.all(
        nonInboxColumns.map(async (col) => {
          console.log(`📧 Fetching emails for column: ${col.title} (id: ${col.id})`);

          // Skip if this column is already being fetched by another flow
          if (columnLoadingRef.current[col.id]) {
            console.log(`  ⏭️ Skipping ${col.id} - already loading (bulk)`);
            return Promise.resolve();
          }

          // Mark loading immediately to avoid race conditions
          columnLoadingRef.current = { ...columnLoadingRef.current, [col.id]: true };
          setColumnLoadingStates(prev => ({ ...prev, [col.id]: true }));

          try {
            // Fetch emails for specific column
            console.log(`  🌐 API call: fetchColumnEmails(${col.id}, limit: 50)`);
            const res = await fetchColumnEmails(col.id, { limit: 50 });

            console.log(`  📦 API Response:`, res);
            console.log(`  📦 Response.data:`, res?.data);

            const emails = res?.data?.messages || [];

            console.log(`  ✅ Fetched ${emails.length} emails for column: ${col.title}`);

            // Update column with fetched emails
            setColumns(prev => prev.map(column => 
              column.id === col.id 
                ? { ...column, items: emails.map(transformEmail) }
                : column
            ));
          } catch (err: any) {
            console.error(`  ❌ Failed to fetch emails for column ${col.title}:`, err);
            console.error(`     Error details:`, err.response?.data || err.message);
            // Set error on the column
            setColumns(prev => prev.map(column => 
              column.id === col.id 
                ? { ...column, hasLabelError: true, labelErrorMessage: err?.message || "Failed to load emails" }
                : column
            ));
          } finally {
            columnLoadingRef.current = { ...columnLoadingRef.current, [col.id]: false };
            setColumnLoadingStates(prev => ({ ...prev, [col.id]: false }));
          }
        })
      );
      
      // 4c. Now fetch inbox LAST, using updated state to filter correctly
      if (inboxColumn) {
        setColumnLoadingStates(prev => ({ ...prev, [inboxColumn.id]: true }));
        
        try {
          const inboxRes = await fetchInboxEmails(50);
          const inboxRaw = inboxRes?.messages || inboxRes?.data?.messages || [];
          
          // Filter out emails that are already in other columns
          // Use functional update to get latest state
          setColumns(prev => {
            const otherColumnEmailIds = new Set<string>();
            prev.forEach(c => {
              if (c.id !== "inbox" && c.items) {
                c.items.forEach(email => otherColumnEmailIds.add(email.id));
              }
            });
            
            const inboxFiltered = inboxRaw.filter((e: any) => !otherColumnEmailIds.has(e.id));
            
            return prev.map(column => 
              column.id === inboxColumn.id 
                ? { ...column, items: inboxFiltered.map(transformEmail) }
                : column
            );
          });
        } catch (err: any) {
          console.error(`Failed to fetch emails for inbox:`, err);
          setColumns(prev => prev.map(column => 
            column.id === inboxColumn.id 
              ? { ...column, hasLabelError: true, labelErrorMessage: err?.message || "Failed to load emails" }
              : column
          ));
        } finally {
          setColumnLoadingStates(prev => ({ ...prev, [inboxColumn.id]: false }));
        }
      }

    } catch (err: any) {
      console.error("Failed to fetch Kanban data:", err);
      setError(err?.response?.data?.message || "Failed to load emails");
      setIsLoading(false);
    }
  }, []);

  // --- FETCH COLUMN DATA (Individual Column) ---
  const fetchColumnData = useCallback(async (columnId: string, limit: number = 50) => {
    // Prevent duplicate fetches for the same column
    if (columnLoadingRef.current[columnId]) {
      console.log(`Skipping fetch for ${columnId} because it's already loading`);
      return;
    }

    // Mark as loading immediately to avoid race conditions
    columnLoadingRef.current = { ...columnLoadingRef.current, [columnId]: true };
    setColumnLoadingStates(prev => ({ ...prev, [columnId]: true }));

    try {
      // Special handling for inbox
      if (columnId === "inbox") {
        const inboxRes = await fetchInboxEmails(limit);
        const inboxRaw = inboxRes?.messages || inboxRes?.data?.messages || [];
        
        // Filter out emails that are already in other columns
        // Use functional update to get LATEST state (avoid stale closure)
        setColumns(prev => {
          const otherColumnEmailIds = new Set<string>();
          prev.forEach(col => {
            if (col.id !== "inbox") {
              col.items.forEach(email => otherColumnEmailIds.add(email.id));
            }
          });
          
          const inboxFiltered = inboxRaw.filter((e: any) => !otherColumnEmailIds.has(e.id));
          
          return prev.map(col => 
            col.id === columnId 
              ? { ...col, items: inboxFiltered.map(transformEmail) }
              : col
          );
        });
      } else {
        // Fetch emails for specific column
        const res = await fetchColumnEmails(columnId, { limit });
        const emails = res?.data?.messages || [];
        
        // Update column with fetched emails
        setColumns(prev => prev.map(col => 
          col.id === columnId 
            ? { ...col, items: emails.map(transformEmail) }
            : col
        ));
      }
    } catch (err: any) {
      console.error(`Failed to fetch emails for column ${columnId}:`, err);
      // Optionally set error on the column
      setColumns(prev => prev.map(col => 
        col.id === columnId 
          ? { ...col, hasLabelError: true, labelErrorMessage: err?.message || "Failed to load emails" }
          : col
      ));
    } finally {
      columnLoadingRef.current = { ...columnLoadingRef.current, [columnId]: false };
      setColumnLoadingStates(prev => ({ ...prev, [columnId]: false }));
    }
  }, []);

  // --- ACTION: ADD COLUMN ---
  const addColumn = useCallback(async (
    title: string, 
    color: string, 
    gmailLabel?: string, 
    createNewLabel?: boolean
  ) => {
    const tempId = `temp-${Date.now()}`;
    const newColumn: Column = {
      id: tempId,
      title,
      isSystem: false,
      items: [],
      color: color
    };

    // Optimistic Update
    setColumns(prev => [...prev, newColumn]);

    try {
      // Gọi API tạo cột với gmailLabel và createNewLabel
      const res = await api.post('/kanban/columns', { 
        name: title, 
        color,
        gmailLabel,
        createNewLabel
      });

      // Cập nhật ID thật và emails từ phản hồi API
      const responseData = res?.data?.data || res?.data;
      const newId = responseData?.id || tempId;
      const emails = responseData?.emails || []; // Emails từ backend
      
      // Transform emails using the same logic
      const transformedEmails = emails.map(transformEmail);
      
      setColumns(prev => prev.map(c => 
        c.id === tempId 
          ? { ...c, id: newId, items: transformedEmails } // Cập nhật với emails
          : c
      ));
    } catch (err) {
      console.error("Failed to add column", err);
      // Rollback nếu API thất bại
      setColumns(prev => prev.filter(c => c.id !== tempId));
      throw err;
    }
  }, []);

  // --- ACTION: DELETE COLUMN ---
  const deleteColumn = useCallback(async (columnId: string) => {
    // Backup for rollback
    const backupColumns = [...columns];

    // Optimistic Update: Remove column immediately
    setColumns(prev => prev.filter(c => c.id !== columnId));

    try {
      // Gọi API xóa cột
      await deleteKanbanColumn(columnId);
    } catch (err) {
      console.error("Failed to delete column", err);
      // Rollback nếu API thất bại
      setColumns(backupColumns);
      throw err;
    }
  }, [columns]);

  // --- ACTION: UPDATE COLUMN TITLE ---
  const updateColumnTitle = useCallback(async (columnId: string, newTitle: string) => {
    // Backup for rollback
    const backupColumns = [...columns];

    // Optimistic Update: Update column title immediately
    setColumns(prev => prev.map(c => 
      c.id === columnId ? { ...c, title: newTitle } : c
    ));

    try {
      // Gọi API cập nhật cột
      await updateKanbanColumn(columnId, { name: newTitle });
    } catch (err) {
      console.error("Failed to update column title", err);
      // Rollback nếu API thất bại
      setColumns(backupColumns);
      throw err;
    }
  }, [columns]);

  // --- ACTION: MOVE EMAIL ---
  const moveEmailAction = useCallback(async (
    emailId: string,
    threadId: string,
    fromColumnId: string,
    toColumnId: string,
    destinationIndex?: number
  ) => {
    // Tìm email để check logic summary
    const sourceCol = columns.find(c => c.id === fromColumnId);
    const emailToMove = sourceCol?.items.find(e => e.id === emailId);

    const shouldGenerateSummary =
      fromColumnId === "inbox" &&
      emailToMove &&
      (!emailToMove.summary || emailToMove.summary === "No summary available");

    // ⚠️ IMPORTANT: NO optimistic update here to avoid @hello-pangea/dnd errors
    // @hello-pangea/dnd handles the visual update during drag
    // We only update state after API call completes

    try {
      // 🔥 WEEK 4: Use new dynamic moveEmail API
      await moveEmail(emailId, fromColumnId, toColumnId);
      
      // NOW update state after API succeeds
      setColumns((prev) => {
        const newColumns = prev.map(col => ({ ...col, items: [...col.items] }));

        const sourceColumn = newColumns.find(c => c.id === fromColumnId);
        const destColumn = newColumns.find(c => c.id === toColumnId);

        if (!sourceColumn || !destColumn) return prev;

        const emailIndex = sourceColumn.items.findIndex(e => e.id === emailId);
        if (emailIndex === -1) return prev;

        // Cắt khỏi nguồn
        const [movedItem] = sourceColumn.items.splice(emailIndex, 1);

        // Chèn vào đích ở ĐÚNG VỊ TRÍ mà user drag
        if (destinationIndex !== undefined) {
          destColumn.items.splice(destinationIndex, 0, movedItem);
        } else {
          destColumn.items.push(movedItem);
        }

        return newColumns;
      });
      
      // Generate summary if needed (call API directly to avoid dependency)
      if (shouldGenerateSummary) {
        generateEmailSummary(emailId, false).catch(err => {
          console.error("Failed to generate summary:", err);
        });
      }
    } catch (err: any) {
      console.error("Failed to move email:", err);
      
      // Rollback by fetching fresh data
      await fetchData();
      
      throw err;
    }
  }, [columns, fetchData, moveEmail]);

  // --- ACTION: GENERATE SUMMARY ---
  const generateSummary = useCallback(async (emailId: string, forceRegenerate = false) => {
    try {
      const result = await generateEmailSummary(emailId, forceRegenerate, false);
      if (result.status === 429) return null;

      // Update state sâu trong mảng columns
      setColumns((prev) =>
        prev.map(col => ({
          ...col,
          items: col.items.map(email =>
            email.id === emailId
              ? { ...email, summary: result.data?.summary || email.summary }
              : email
          )
        }))
      );
      return result.data?.summary;
    } catch (err) {
      console.error("Failed to generate summary:", err);
      return null;
    }
  }, []);

  // --- ACTION: SNOOZE ---
  const snoozeEmail = useCallback(async (
    emailId: string,
    threadId: string,
    snoozedUntil: string,
    sourceColumnId: string,
    onSuccess?: () => void,
    onError?: (error: any) => void
  ) => {
    // Optimistic: Xóa khỏi cột hiện tại (và thêm vào list snoozed ảo nếu cần hiển thị)
    setColumns((prev) => {
      const newColumns = prev.map(col => {
        if (col.id === sourceColumnId) {
          return { ...col, items: col.items.filter(e => e.id !== emailId) };
        }
        return col;
      });
      return newColumns;
    });

    // Cập nhật state snoozedItems riêng để trigger logic timeout
    // (Logic thực tế phức tạp hơn chút vì cần lấy object email đầy đủ)

    try {
      await snoozeEmailAPI(emailId, threadId, snoozedUntil);
      // Sau khi API thành công, fetch lại data để đồng bộ list snoozedItems chính xác
      fetchData();
      onSuccess?.();
    } catch (err) {
      console.error("Failed to snooze:", err);
      fetchData(); // Rollback
      onError?.(err);
    }
  }, [fetchData]);

  // --- ACTION: UNSNOOZE ---
  const unsnoozeEmail = useCallback(async (emailId: string, onSuccess?: () => void, onError?: (error: any) => void) => {
    try {
      await unsnoozeEmailAPI(emailId);
      await fetchData();
      onSuccess?.();
    } catch (err) {
      console.error("Failed to unsnooze:", err);
      onError?.(err);
    }
  }, [fetchData]);

  const initialFetchRef = useRef(false);
  useEffect(() => {
    // React Strict Mode in development may mount effects twice.
    // Ensure the initial data fetch runs only once.
    if (initialFetchRef.current) return;
    initialFetchRef.current = true;
    fetchData();
  }, [fetchData]);

  // Keep columnLoadingRef in sync with state
  useEffect(() => {
    columnLoadingRef.current = columnLoadingStates;
  }, [columnLoadingStates]);

  // Smart Snooze Logic (Giữ nguyên)
  useEffect(() => {
    if (snoozedItems.length === 0) return;
    const now = Date.now();
    const nextWakeUp = snoozedItems
      .map((e) => e.snoozedUntil ? new Date(e.snoozedUntil).getTime() : Infinity)
      .filter((t) => t > now)
      .sort((a, b) => a - b)[0];

    if (!nextWakeUp || nextWakeUp === Infinity) return;
    const delay = Math.max(0, nextWakeUp - now + 2000);
    const timeoutId = setTimeout(() => {
      console.log("🔔 Snooze expired - refreshing...");
      fetchData();
    }, delay);
    return () => clearTimeout(timeoutId);
  }, [snoozedItems, fetchData]);

  return {
    columns,      // Trả về Array<Column>
    setColumns,
    isLoading,
    error,
    moveEmail: moveEmailAction,  // Renamed to avoid conflict with imported API function
    generateSummary,
    snoozeEmail,
    unsnoozeEmail,
    addColumn,    // Hàm mới
    deleteColumn, // Hàm xóa cột
    updateColumnTitle, // Hàm cập nhật tên cột
    fetchColumnData, // Hàm fetch emails cho một cột cụ thể
    columnLoadingStates, // Loading states cho từng cột
    refreshData: fetchData,
  };
};