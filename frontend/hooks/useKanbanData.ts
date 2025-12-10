import { useState, useEffect, useCallback } from 'react';
import { 
  fetchKanbanColumnEmails, 
  fetchInboxEmails,
  fetchSnoozedEmails,
  moveEmailToColumn, 
  generateEmailSummary 
} from '@/lib/api';

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
      if (!fromStr) return 'Unknown';
      const parts = fromStr.split('<');
      return parts[0].trim().replace(/"/g, '') || fromStr;
    };

    const getAvatar = (fromStr: string) => {
      const name = getSenderName(fromStr);
      return name.charAt(0).toUpperCase();
    };

    const getColor = () => {
      const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-red-500'];
      return colors[Math.floor(Math.random() * colors.length)];
    };

    const formatTime = (dateStr: string) => {
      const date = new Date(dateStr);
      const now = new Date();
      const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

      if (diffHours < 1) return 'Just now';
      if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
      if (diffHours < 48) return 'Yesterday';
      return date.toLocaleDateString();
    };

    return {
      id: email.id,
      threadId: email.threadId,
      sender: getSenderName(email.from),
      subject: email.subject || '(No Subject)',
      snippet: email.snippet || '',
      summary: email.summary || email.snippet || 'No summary available',
      from: email.from,
      date: email.date,
      time: formatTime(email.date),
      avatar: getAvatar(email.from),
      color: getColor(),
      status: email.status,
      isSnoozed: email.isSnoozed,
      snoozedUntil: email.snoozedUntil,
    };
  };

  // Fetch Kanban data from multiple endpoints
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch all columns in parallel
      const [inboxRes, todoRes, doneRes, snoozedRes] = await Promise.allSettled([
        fetchInboxEmails(50),
        fetchKanbanColumnEmails('TODO'),
        fetchKanbanColumnEmails('DONE'),
        fetchSnoozedEmails(),
      ]);

      // Extract data from responses
      const inbox = inboxRes.status === 'fulfilled' ? (inboxRes.value?.messages || inboxRes.value?.data?.messages || []) : [];
      const todo = todoRes.status === 'fulfilled' ? (todoRes.value?.data?.messages || []) : [];
      const done = doneRes.status === 'fulfilled' ? (doneRes.value?.data?.messages || []) : [];
      const snoozed = snoozedRes.status === 'fulfilled' ? (snoozedRes.value?.data || []) : [];
      
      setColumns({
        inbox: inbox.map(transformEmail),
        todo: todo.map(transformEmail),
        done: done.map(transformEmail),
        snoozed: snoozed.map(transformEmail),
      });
    } catch (err: any) {
      console.error('Failed to fetch Kanban data:', err);
      setError(err?.response?.data?.message || 'Failed to load emails');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Move email between columns
  const moveEmail = useCallback(async (
    emailId: string,
    threadId: string,
    fromColumn: string,
    toColumn: string
  ) => {
    // Map column names to backend status values
    const columnToStatus: Record<string, string> = {
      inbox: 'INBOX',
      todo: 'TODO',
      inProgress: 'IN_PROGRESS',
      done: 'DONE',
    };

    const toStatus = columnToStatus[toColumn] || toColumn.toUpperCase();

    // Optimistic update
    setColumns(prev => {
      const sourceList = prev[fromColumn as keyof KanbanColumns];
      const emailToMove = sourceList.find(e => e.id === emailId);
      
      if (!emailToMove) return prev;

      return {
        ...prev,
        [fromColumn]: sourceList.filter(e => e.id !== emailId),
        [toColumn]: [...prev[toColumn as keyof KanbanColumns], emailToMove],
      };
    });

    try {
      await moveEmailToColumn(emailId, threadId, toStatus);
      
      // Auto-generate summary if moving from inbox and no summary exists
      if (fromColumn === 'inbox') {
        generateSummary(emailId);
      }
    } catch (err: any) {
      console.error('Failed to move email:', err);
      // Rollback on error
      await fetchData();
      throw err;
    }
  }, [fetchData]);

  // Generate AI summary for an email
  const generateSummary = useCallback(async (emailId: string) => {
    try {
      const result = await generateEmailSummary(emailId, false);
      
      // Update summary in state
      setColumns(prev => {
        const updateColumn = (emails: KanbanEmail[]) =>
          emails.map(email =>
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
    } catch (err) {
      console.error('Failed to generate summary:', err);
      return null;
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh removed - only refresh on user action or manual refresh

  return {
    columns,
    setColumns,
    isLoading,
    error,
    refreshData: fetchData,
    moveEmail,
    generateSummary,
  };
};
