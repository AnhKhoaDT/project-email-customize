import { useState, useEffect, useCallback } from "react";
import {
  fetchKanbanColumnEmails,
  fetchInboxEmails,
  fetchSnoozedEmails,
  moveEmailToColumn,
  generateEmailSummary,
  snoozeEmail as snoozeEmailAPI,
  unsnoozeEmail as unsnoozeEmailAPI,
} from "@/lib/api";

interface KanbanEmail {
  id: string;
  threadId: string;
  sender: string;
  subject: string;
  snippet: string;
  summary?: string;
  from: string;
  date: string;
  time: string;
  avatar: string;
  color: string;
  status?: string;
  isSnoozed?: boolean;
  snoozedUntil?: string;

  isUnread: boolean;
  hasAttachment: boolean;
}

interface KanbanColumns {
  inbox: KanbanEmail[];
  todo: KanbanEmail[];
  done: KanbanEmail[];
  snoozed: KanbanEmail[];
}

export const useKanbanData = () => {
  const [columns, setColumns] = useState<KanbanColumns>({
    inbox: [],
    todo: [],
    done: [],
    snoozed: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Transform backend email to frontend format
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
      const colors = [
        "bg-blue-500",
        "bg-purple-500",
        "bg-green-500",
        "bg-orange-500",
        "bg-red-500",
      ];
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
    };
  };

  // Fetch Kanban data from multiple endpoints
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch all columns in parallel
      const [inboxRes, todoRes, doneRes, snoozedRes] = await Promise.allSettled(
        [
          fetchInboxEmails(50),
          fetchKanbanColumnEmails("TODO"),
          fetchKanbanColumnEmails("DONE"),
          fetchSnoozedEmails(),
        ]
      );

      // Extract data from responses
      const inboxRaw =
        inboxRes.status === "fulfilled"
          ? inboxRes.value?.messages || inboxRes.value?.data?.messages || []
          : [];
      const todo =
        todoRes.status === "fulfilled"
          ? todoRes.value?.data?.messages || []
          : [];
      const done =
        doneRes.status === "fulfilled"
          ? doneRes.value?.data?.messages || []
          : [];
      const snoozed =
        snoozedRes.status === "fulfilled" ? snoozedRes.value?.data || [] : [];

      // Get email IDs already in Kanban to filter out from inbox
      const kanbanEmailIds = new Set([
        ...todo.map((e: any) => e.id),
        ...done.map((e: any) => e.id),
        ...snoozed.map((e: any) => e.id),
      ]);

      // Filter inbox: exclude emails already in TODO/DONE/Snoozed
      const inbox = inboxRaw.filter((e: any) => !kanbanEmailIds.has(e.id));

      setColumns({
        inbox: inbox.map(transformEmail),
        todo: todo.map(transformEmail),
        done: done.map(transformEmail),
        snoozed: snoozed.map(transformEmail),
      });
    } catch (err: any) {
      console.error("Failed to fetch Kanban data:", err);
      setError(err?.response?.data?.message || "Failed to load emails");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Move email between columns
  const moveEmail = useCallback(
    async (
      emailId: string,
      threadId: string,
      fromColumn: string,
      toColumn: string,
      destinationIndex?: number
    ) => {
      // Map column names to backend status values
      const columnToStatus: Record<string, string> = {
        inbox: "INBOX",
        todo: "TODO",
        inProgress: "IN_PROGRESS",
        done: "DONE",
      };

      const toStatus = columnToStatus[toColumn] || toColumn.toUpperCase();

      // Check email BEFORE optimistic update
      const sourceList = columns[fromColumn as keyof KanbanColumns];
      const emailToMove = sourceList.find((e) => e.id === emailId);
      const shouldGenerateSummary =
        fromColumn === "inbox" &&
        emailToMove &&
        (!emailToMove.summary ||
          emailToMove.summary === emailToMove.snippet ||
          emailToMove.summary === "No summary available");

      // Optimistic update
      setColumns((prev) => {
        const sourceList = prev[fromColumn as keyof KanbanColumns];
        const emailToMove = sourceList.find((e) => e.id === emailId);

        if (!emailToMove) return prev;

        // Remove from source
        const newSourceList = sourceList.filter((e) => e.id !== emailId);

        // Add to destination at specific index
        const destList = [...prev[toColumn as keyof KanbanColumns]];
        if (destinationIndex !== undefined) {
          destList.splice(destinationIndex, 0, emailToMove);
        } else {
          destList.push(emailToMove);
        }

        return {
          ...prev,
          [fromColumn]: newSourceList,
          [toColumn]: destList,
        };
      });

      try {
        await moveEmailToColumn(emailId, threadId, toStatus);

        // Auto-generate summary if moving from inbox and no summary exists
        if (shouldGenerateSummary) {
          generateSummary(emailId, false);
        }
      } catch (err: any) {
        console.error("Failed to move email:", err);
        // Rollback on error
        await fetchData();
        throw err;
      }
    },
    [columns, fetchData]
  );

  // Generate AI summary for an email
  const generateSummary = useCallback(
    async (emailId: string, forceRegenerate = false) => {
      try {
        const result = await generateEmailSummary(
          emailId,
          forceRegenerate,
          false
        );

        // Check for rate limit error
        if (result.status === 429) {
          console.warn("Rate limit exceeded:", result.message);
          return null;
        }

        // Update summary in state
        setColumns((prev) => {
          const updateColumn = (emails: KanbanEmail[]) =>
            emails.map((email) =>
              email.id === emailId
                ? { ...email, summary: result.data?.summary || email.summary }
                : email
            );

          return {
            inbox: updateColumn(prev.inbox),
            todo: updateColumn(prev.todo),
            done: updateColumn(prev.done),
            snoozed: updateColumn(prev.snoozed),
          };
        });

        return result.data?.summary;
      } catch (err: any) {
        console.error("Failed to generate summary:", err);

        // Handle rate limit error
        if (err?.response?.status === 429) {
          console.warn("Rate limit exceeded");
        }

        return null;
      }
    },
    []
  );

  // Snooze an email
  const snoozeEmail = useCallback(
    async (
      emailId: string,
      threadId: string,
      snoozedUntil: string,
      sourceColumn: string
    ) => {
      // Optimistic update - move to snoozed column
      setColumns((prev) => {
        const sourceList = prev[sourceColumn as keyof KanbanColumns];
        const emailToSnooze = sourceList.find((e) => e.id === emailId);

        if (!emailToSnooze) return prev;

        const newSourceList = sourceList.filter((e) => e.id !== emailId);

        return {
          ...prev,
          [sourceColumn]: newSourceList,
          snoozed: [
            ...prev.snoozed,
            { ...emailToSnooze, isSnoozed: true, snoozedUntil },
          ],
        };
      });

      try {
        await snoozeEmailAPI(emailId, threadId, snoozedUntil);
      } catch (err: any) {
        console.error("Failed to snooze email:", err);
        // Rollback on error
        await fetchData();
        throw err;
      }
    },
    [fetchData]
  );

  // Unsnooze an email manually
  const unsnoozeEmail = useCallback(
    async (emailId: string) => {
      try {
        await unsnoozeEmailAPI(emailId);
        // Refresh data to get updated state from backend
        await fetchData();
      } catch (err: any) {
        console.error("Failed to unsnooze email:", err);
        throw err;
      }
    },
    [fetchData]
  );

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Smart snooze wake-up: Schedule refresh at exact snooze expiry time
  useEffect(() => {
    if (columns.snoozed.length === 0) return;

    // Find the earliest snooze time
    const now = Date.now();
    const nextWakeUp = columns.snoozed
      .map((email) =>
        email.snoozedUntil ? new Date(email.snoozedUntil).getTime() : Infinity
      )
      .filter((time) => time > now)
      .sort((a, b) => a - b)[0];

    if (!nextWakeUp || nextWakeUp === Infinity) return;

    // Calculate delay with buffer (add 2 seconds for backend processing)
    const delay = Math.max(0, nextWakeUp - now + 2000);

    // Schedule single refresh at wake-up time
    const timeoutId = setTimeout(() => {
      console.log("🔔 Snooze expired - refreshing data...");
      fetchData();
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [columns.snoozed, fetchData]);

  return {
    columns,
    setColumns,
    isLoading,
    error,
    refreshData: fetchData,
    moveEmail,
    generateSummary,
    snoozeEmail,
    unsnoozeEmail,
  };
};
