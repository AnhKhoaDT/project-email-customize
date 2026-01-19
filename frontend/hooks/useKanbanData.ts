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
  fetchGmailLabels,
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
  kanbanColumnId?: string; // NEW: Primary source of truth
  cachedColumnName?: string; // NEW: Column name display
  position?: number; // NEW: explicit position within column (0-based)
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
  isVisible?: boolean; // Whether column is visible on board
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

export const useKanbanData = () => {
  // Initial State: Mảng rỗng - sẽ được populate từ backend
  const [columns, setColumns] = useState<Column[]>([]);

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
      kanbanColumnId: email.kanbanColumnId || 'inbox',
      cachedColumnName: email.cachedColumnName,
      position: (() => {
        if (typeof email.position === 'number') return email.position;
        if (typeof email.position === 'string' && email.position.trim() !== '') {
          const n = Number(email.position);
          return Number.isFinite(n) ? n : undefined;
        }
        return undefined;
      })(),
    };
  };

  // --- ACTION: GENERATE SUMMARY ---
  const generateSummary = useCallback(async (emailId: string, forceRegenerate = false) => {
    try {
      const result = await generateEmailSummary(emailId, forceRegenerate, false);

      // Normalize summary location: backend may return { data: { summary } } or { summary }
      const summary = result?.data?.summary ?? result?.summary ?? null;

      // If backend uses a 429 HTTP status, axios will throw and we'll hit the catch below.
      // But if backend encodes rate-limit in payload, handle it defensively.
      if (result?.status === 429 || result?.code === 429) return null;

      // Update state deeply within columns
      if (summary !== null) {
        setColumns((prev) =>
          prev.map(col => ({
            ...col,
            items: col.items.map(email =>
              email.id === emailId
                ? { ...email, summary: summary || email.summary }
                : email
            )
          }))
        );
      }

      return summary;
    } catch (err: any) {
      // Rate limiting returns HTTP 429 from server; axios surfaces it on err.response.status
      if (err?.response?.status === 429) return null;
      console.error("Failed to generate summary:", err);
      return null;
    }
  }, [setColumns]);


  // --- FETCH DATA ---
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 1. Fetch Kanban Config first (to get column list)
      const configRes = await fetchKanbanConfig();
      // `fetchKanbanConfig()` returns the response data (the config object), not an axios wrapper.
      const backendColumns = configRes?.columns || [];

      // 2. Fetch snoozed emails
      const snoozedRes = await fetchSnoozedEmails().catch(() => ({ data: [] }));
      const snoozedRaw = snoozedRes?.data || [];
      setSnoozedItems(snoozedRaw.map(transformEmail));

      // 3. Build initial columns structure (empty items, will be loaded separately)
      // If backend already includes an `inbox` column, don't insert a fixed one to avoid duplication.
      const backendHasInbox = backendColumns.some((c: any) => c.id === 'inbox');
      const fixedInboxColumn: Column | null = backendHasInbox ? null : {
        id: "inbox",
        title: "Inbox",
        isSystem: true,
        color: "#3b82f6",
        gmailLabel: "INBOX",
        items: [] // Will be fetched separately
      };

      // Sort backend columns by order first, then map to frontend format
      const sortedBackendColumns = [...backendColumns].sort((a: any, b: any) => {
        const orderA = a.order ?? 999;
        const orderB = b.order ?? 999;
        return orderA - orderB;
      });

      // Map backend columns with all fields (already sorted by order)
      const mappedBackendColumns: Column[] = sortedBackendColumns.map((col: any) => ({
        id: col.id,
        title: col.name,
        isSystem: col.isSystem || false,
        color: col.color || "#64748b",
        gmailLabel: col.gmailLabel,
        gmailLabelName: col.gmailLabelName, // Add gmailLabelName mapping
        hasLabelError: col.hasLabelError,
        labelErrorMessage: col.labelErrorMessage,
        autoArchive: col.autoArchive || (String(col.gmailLabel || '').toUpperCase() === 'ARCHIVE') || false, // Treat ARCHIVE as autoArchive
        isVisible: col.isVisible !== undefined ? col.isVisible : true, // Add isVisible mapping
        items: [] // Will be fetched separately
      }));

      // Validate mapped Gmail labels against actual Gmail labels from the account
      try {
        let gmailLabels: any[] = [];
        let gmailFetchSucceeded = false;
        try {
          gmailLabels = await fetchGmailLabels();
          gmailFetchSucceeded = true;
        } catch (err) {
          console.warn('Failed to fetch Gmail labels (skipping label validation):', err);
          gmailLabels = [];
          gmailFetchSucceeded = false;
        }

        if (gmailFetchSucceeded) {
          const gmailIds = new Set((gmailLabels || []).map((l: any) => l.id));
          const gmailNames = new Set((gmailLabels || []).map((l: any) => (l.name || "").toLowerCase()));

          mappedBackendColumns.forEach((col) => {
            if (!col.gmailLabel) return;
            // Do not validate the special 'ARCHIVE' display label (it's handled as autoArchive)
            if (String(col.gmailLabel || '').toUpperCase() === 'ARCHIVE') return;

            const raw = String(col.gmailLabel || "");
            const labelKey = raw.toLowerCase();
            // Match by id OR by uppercase id (system labels) OR by name
            const existsById = gmailIds.has(raw) || gmailIds.has(raw.toUpperCase());
            const existsByName = gmailNames.has(labelKey);
            if (!existsById && !existsByName) {
              col.hasLabelError = true;
              col.labelErrorMessage = `Gmail label "${col.gmailLabel}" not found.`;
            }
          });
        } else {
          // Skip setting hasLabelError when we couldn't fetch labels (avoid false positives)
        }
      } catch (e) {
        console.warn("Failed to validate Gmail labels:", e);
      }

      // If backend has no columns, default to Inbox / To Do / In Progress / Done
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

          // In progress -> IMPORTANT
          const progressRes = await api.post('/kanban/columns', {
            name: 'In Progress',
            color: '#eab308', // Yellow (Amber-500)
            gmailLabel: 'IMPORTANT',
            createNewLabel: false
          });

          // Done → Archive (special system label)
          const doneRes = await api.post('/kanban/columns', {
            name: 'Done',
            color: '#22c55e',
            gmailLabel: 'ARCHIVE', // Use special Archive label
            createNewLabel: false // ARCHIVE already exists as system label
          });

          const todoData = todoRes?.data?.data || todoRes?.data;
          const doneData = doneRes?.data?.data || doneRes?.data;
          const progressData = progressRes?.data?.data || progressRes?.data;

          const defaultTodo: Column = {
            id: todoData?.id || 'todo',
            title: 'To Do',
            isSystem: false, // User can edit/delete
            color: '#f97316',
            gmailLabel: 'STARRED',
            items: []
          };

          const defaultProgress: Column = {
            id: progressData?.id || 'in_progress',
            title: 'In Progress',
            isSystem: false,
            color: '#eab308',
            gmailLabel: progressData?.newLabelId || 'IN_PROGRESS',
            gmailLabelName: 'IN_PROGRESS',
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

          finalColumns = [(fixedInboxColumn || { id: 'inbox', title: 'Inbox', isSystem: true, color: '#3b82f6', gmailLabel: 'INBOX', items: [] }), defaultTodo, defaultDone, defaultProgress];
          console.log('✅ Default columns created in backend');
        } catch (err: any) {
          console.error('❌ Failed to create default columns:', err);
          // Fallback to client-side only defaults
          const defaultTodo: Column = { id: "todo", title: "To Do", isSystem: false, color: "#f97316", gmailLabel: "STARRED", items: [] };
          const defaultDone: Column = { id: "done", title: "Done", isSystem: false, color: "#22c55e", gmailLabel: "ARCHIVE", items: [] };
          const defaultProgress: Column = { id: "in_progress", title: "In Progress", isSystem: false, color: "#eab308", gmailLabel: "IMPORTANT", items: [] };
          finalColumns = [(fixedInboxColumn || { id: 'inbox', title: 'Inbox', isSystem: true, color: '#3b82f6', gmailLabel: 'INBOX', items: [] }), defaultTodo, defaultDone];
        }
      } else {
        // Filter out invisible columns and maintain order from database
        const visibleColumns = mappedBackendColumns.filter(col => col.isVisible !== false);
        finalColumns = fixedInboxColumn ? [fixedInboxColumn, ...visibleColumns] : visibleColumns;
      }
      setColumns(finalColumns);

      setIsLoading(false);

      // 4. Fetch emails for each column separately (in background)
      // Fetch all columns (including inbox) in parallel to avoid waiting sequentially.
      // We will deduplicate inbox results against other columns using fetched IDs.
      const inboxColumn = finalColumns.find(c => c.id === "inbox");
      const allColumns = finalColumns;

      // Prepare fetch promises for each column
      const fetchPromises = allColumns.map(async (col) => {
        // Skip if already loading
        if (columnLoadingRef.current[col.id]) {
          console.log(`  ⏭️ Skipping ${col.id} - already loading`);
          return { colId: col.id, raw: [] };
        }

        // Mark loading
        columnLoadingRef.current = { ...columnLoadingRef.current, [col.id]: true };
        setColumnLoadingStates(prev => ({ ...prev, [col.id]: true }));

        try {
          if (col.id === "inbox") {
            const inboxRes = await fetchInboxEmails(50);
            const inboxRaw = inboxRes?.messages || inboxRes?.data?.messages || [];
            return { colId: col.id, raw: inboxRaw };
          } else {
            const res = await fetchColumnEmails(col.id, { limit: 50 });
            const emails = res?.data?.messages || [];
            return { colId: col.id, raw: emails };
          }
        } catch (err: any) {
          console.error(`Failed to fetch emails for column ${col.id}:`, err);
          const status = err?.response?.status;
          const isLabelNotFound = status === 404 || err?.response?.data?.code === 'LABEL_NOT_FOUND';
          if (isLabelNotFound) {
            setColumns(prev => prev.map(column =>
              column.id === col.id
                ? { ...column, hasLabelError: true, labelErrorMessage: err?.response?.data?.message || err?.message || "Label not found" }
                : column
            ));
          } else {
            setError(err?.response?.data?.message || err?.message || "Failed to load emails");
          }
          return { colId: col.id, raw: [] };
        } finally {
          columnLoadingRef.current = { ...columnLoadingRef.current, [col.id]: false };
          setColumnLoadingStates(prev => ({ ...prev, [col.id]: false }));
        }
      });

      const results = await Promise.all(fetchPromises);

      // Map raw results by column id and assign emails to each column based on kanbanColumnId
      const colEmailMap: Record<string, any[]> = {};
      results.forEach(r => {
        colEmailMap[r.colId] = r.raw || [];
      });

      // After assigning inbox items, trigger summary generation for first 5 inbox emails
      try {
        setColumns(prev => prev.map(col => ({
          ...col,
          items: (colEmailMap[col.id] || []).map(transformEmail)
        })));

        const inboxRaw = colEmailMap['inbox'] || [];
        const inboxTransformed: KanbanEmail[] = inboxRaw.map(transformEmail);
        const emailsToGenerate = inboxTransformed.slice(0, 5).filter(
          email => !email.summary ||
            email.summary === email.snippet ||
            email.summary === "No summary available");

        // Transform and assign emails to columns
        setColumns(prev => prev.map(col => ({
          ...col,
          items: (colEmailMap[col.id] || []).map(transformEmail)
        })));

        setTimeout(() => {
          emailsToGenerate.forEach((email) => {
            generateSummary(email.id, false).catch(err => {
              console.debug('generateSummary (inbox preload) failed for', email.id, err?.message || err);
            });
          });
        }, 0);
      } catch (e) {
        console.debug('Failed to trigger inbox preload summaries', e);
      }

    } catch (err: any) {
      console.error("Failed to fetch Kanban data:", err);
      setError(err?.response?.data?.message || "Failed to load emails");
      setIsLoading(false);
    }
  }, [generateSummary]);

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

        // Transform first so we can both assign and act on the items
        const transformed: KanbanEmail[] = inboxRaw.map(transformEmail);

        // Assign inbox items directly; we rely on kanbanColumnId from backend.
        setColumns(prev => prev.map(col =>
          col.id === columnId
            ? { ...col, items: transformed }
            : col
        ));

        // Trigger summary generation for first 5 inbox emails if missing
        try {
          transformed.slice(0, 5).forEach(email => {
            if (!email.summary || email.summary === "") {
              generateSummary(email.id, false).catch(err => {
                console.debug('generateSummary (inbox column) failed for', email.id, err?.message || err);
              });
            }
          });
        } catch (e) {
          console.debug('Failed to trigger inbox column summaries', e);
        }
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
      const status = err?.response?.status;
      const isLabelNotFound = status === 404 || err?.response?.data?.code === 'LABEL_NOT_FOUND';
      if (isLabelNotFound) {
        setColumns(prev => prev.map(col =>
          col.id === columnId
            ? { ...col, hasLabelError: true, labelErrorMessage: err?.response?.data?.message || err?.message || "Label not found" }
            : col
        ));
      } else {
        setError(err?.response?.data?.message || err?.message || "Failed to load emails");
      }
    } finally {
      columnLoadingRef.current = { ...columnLoadingRef.current, [columnId]: false };
      setColumnLoadingStates(prev => ({ ...prev, [columnId]: false }));
    }
  }, [generateSummary]);

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

    // Find column items to move back to inbox
    const columnToDelete = columns.find(c => c.id === columnId);
    const itemsToMove = columnToDelete?.items || [];

    // Optimistic Update: Remove column and merge its items into inbox
    setColumns(prev => {
      // Remove the deleted column
      const without = prev.filter(c => c.id !== columnId);

      // Merge items into inbox (avoid duplicates)
      return without.map(c => {
        if (c.id === 'inbox') {
          const existingIds = new Set(c.items.map(i => i.id));
          const merged = [...c.items];
          itemsToMove.forEach(it => {
            if (!existingIds.has(it.id)) merged.push(it);
          });
          return { ...c, items: merged };
        }
        return c;
      });
    });

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
    // Update state after API succeeds. Be resilient to optimistic-first updates
    // by locating the moved item anywhere in the board (source or dest),
    // removing it, inserting at `destinationIndex`, and recomputing positions.
    try {
      await moveEmail(emailId, fromColumnId, toColumnId, destinationIndex);

      setColumns((prev) => {
        const newColumns = prev.map(col => ({ ...col, items: [...col.items] }));

        const destColumn = newColumns.find(c => c.id === toColumnId);
        if (!destColumn) return prev;

        // Find and remove moved item from wherever it currently is
        let movedItem: KanbanEmail | null = null;
        let originalColumnId: string | null = null;
        for (const col of newColumns) {
          const idx = col.items.findIndex(e => e.id === emailId);
          if (idx !== -1) {
            movedItem = col.items.splice(idx, 1)[0];
            originalColumnId = col.id;
            break;
          }
        }

        // If we couldn't find the item, abort and refresh from server to avoid inconsistent state
        if (!movedItem) return prev;

        // Compute a safe insert index
        const insertAt = typeof destinationIndex === 'number'
          ? Math.max(0, Math.min(destinationIndex, destColumn.items.length))
          : destColumn.items.length;

        destColumn.items.splice(insertAt, 0, movedItem);

        // Recompute positions for affected columns
        newColumns.forEach(col => {
          if (col.id === originalColumnId || col.id === toColumnId) {
            col.items.forEach((it, idx) => {
              (it as any).position = idx;
            });
          }
        });

        return newColumns;
      });
    } catch (err: any) {
      console.error("Failed to move email:", err);
      await fetchData();
      throw err;
    }
  }, [columns, fetchData, moveEmail]);


  // --- ACTION: SNOOZE ---
  const snoozeEmail = useCallback(async (
    emailId: string,
    threadId: string,
    snoozedUntil: string,
    sourceColumnId: string,
    onSuccess?: () => void,
    onError?: (error: any) => void
  ) => {
    // Optimistic: remove from source column and keep the removed email in snoozedItems
    let removedEmail: KanbanEmail | null = null;
    setColumns((prev) => {
      const newColumns = prev.map(col => {
        if (col.id === sourceColumnId) {
          const remaining = col.items.filter(e => {
            if (e.id === emailId) {
              removedEmail = e;
              return false;
            }
            return true;
          });
          return { ...col, items: remaining };
        }
        return col;
      });
      return newColumns;
    });

    // If we captured the full email object, add it to snoozedItems (so timers/watchers work)
    if (removedEmail) {
      setSnoozedItems(prev => {
        // Avoid duplicates
        if (prev.find(e => e.id === removedEmail!.id)) return prev;
        return [...prev, { ...removedEmail!, snoozedUntil }];
      });
    }

    try {
      await snoozeEmailAPI(emailId, threadId, snoozedUntil);
      // Success: we already removed it optimistically and recorded snoozedItems.
      // Do NOT fully refetch the board to avoid a full reload.
      onSuccess?.();
    } catch (err) {
      console.error("Failed to snooze:", err);
      // Rollback: re-insert email back into its source column if we have it, otherwise trigger a refresh
      if (removedEmail) {
        setColumns(prev => prev.map(col => {
          if (col.id === sourceColumnId) {
            // Put it back at the top
            return { ...col, items: [removedEmail!, ...col.items] };
          }
          return col;
        }));
      } else {
        // Fallback: refresh the minimal data
        fetchData();
      }
      // Remove from snoozedItems if present
      setSnoozedItems(prev => prev.filter(e => e.id !== emailId));
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