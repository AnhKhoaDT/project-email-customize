// ========================================
// AXIOS API CLIENT - SECURE TOKEN STRATEGY
// ========================================
// Features:
// - Auto attach access token to requests (Authorization: Bearer)
// - Auto refresh token on 401 Unauthorized via HttpOnly cookie
// - Concurrency handling: multiple failed requests trigger only one refresh
//
// Security:
// 🔒 Access token: Retrieved from window.__accessToken (set by interceptor)
// 🔒 Refresh token: HttpOnly cookie (sent automatically with credentials)
// ========================================

import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { clearTokens } from "./token";

// Global in-memory token storage (window object)
// This is accessible across the app but not persisted
declare global {
  interface Window {
    __accessToken: string | null;
  }
}

if (typeof window !== "undefined") {
  window.__accessToken = null;
}

// Base URL từ environment variable
const BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";

// Create axios instance
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  // QUAN TRỌNG: Enable sending cookies (refresh token)
  withCredentials: true,
});

// ========================================
// REQUEST INTERCEPTOR
// ========================================
// Tự động thêm access token vào mọi request

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Get access token from global in-memory storage
    const token = typeof window !== "undefined" ? window.__accessToken : null;

    if (token) {
      // Attach Bearer token to Authorization header
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ========================================
// RESPONSE INTERCEPTOR
// ========================================
// Auto refresh token khi nhận 401 Unauthorized

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

/**
 * Subscribe to token refresh
 * Các requests đang chờ sẽ được retry sau khi token refresh xong
 */
const subscribeTokenRefresh = (callback: (token: string) => void) => {
  refreshSubscribers.push(callback);
};

/**
 * Notify all subscribers với token mới
 */
const onTokenRefreshed = (token: string) => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
};

/**
 * Call refresh token endpoint
 * Refreshes access token using HttpOnly cookie containing refreshToken
 * Backend reads refreshToken from cookie automatically
 */
const refreshAccessToken = async (): Promise<string> => {
  try {
    console.log("[API] Attempting to refresh token from HttpOnly cookie...");

    // Call refresh endpoint - refreshToken sent via HttpOnly cookie
    const response = await axios.post(
      `${BASE_URL}/auth/refresh`,
      {},
      {
        headers: { "Content-Type": "application/json" },
        withCredentials: true, // CRITICAL: Send cookies with request
      }
    );

    const { accessToken } = response.data;
    console.log("[API] ✅ Token refresh successful!");

    // Save new access token to global in-memory storage
    if (typeof window !== "undefined") {
      window.__accessToken = accessToken;
    }

    return accessToken;
  } catch (error: any) {
    console.error(
      "[API] ❌ Token refresh failed:",
      error?.response?.status,
      error?.response?.data
    );

    // Refresh failed → clear tokens
    clearTokens();
    if (typeof window !== "undefined") {
      window.__accessToken = null;
    }

    // DON'T redirect automatically - let the app handle it
    // The useUserQuery will set isAuthenticated=false and the page will redirect

    throw error;
  }
};

api.interceptors.response.use(
  (response) => response, // Pass through successful responses
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Nếu là lỗi từ auth endpoints, reject ngay lập tức
    // Không cần retry vì auth endpoints không cần refresh token
    if (
      originalRequest.url?.includes("/auth/login") ||
      originalRequest.url?.includes("/auth/register") ||
      originalRequest.url?.includes("/auth/refresh")
    ) {
      return Promise.reject(error);
    }

    // Handle 401 Unauthorized - Token expired
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;

        try {
          const newAccessToken = await refreshAccessToken();
          isRefreshing = false;

          // Notify all waiting requests
          onTokenRefreshed(newAccessToken);

          // Retry original request với token mới
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          isRefreshing = false;
          refreshSubscribers = [];
          return Promise.reject(refreshError);
        }
      }

      // Nếu đang refresh, chờ token mới
      return new Promise((resolve) => {
        subscribeTokenRefresh((token: string) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(api(originalRequest));
        });
      });
    }

    // Reject all other errors
    return Promise.reject(error);
  }
);

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Set access token in global in-memory storage
 * Called by login/refresh flows to update the token
 */
export const setGlobalAccessToken = (token: string | null): void => {
  if (typeof window !== "undefined") {
    window.__accessToken = token;
  }
};

/**
 * Get access token from global in-memory storage
 */
export const getGlobalAccessToken = (): string | null => {
  if (typeof window !== "undefined") {
    return window.__accessToken;
  }
  return null;
};

// ========================================
// KANBAN API FUNCTIONS
// ========================================

/**
 * WEEK 4: Fetch Kanban configuration (dynamic columns)
 */
export const fetchKanbanConfig = async () => {
  const response = await api.get('/kanban/config');
  return response.data;
};

/**
 * WEEK 4: Fetch all Gmail labels for user
 * Used in "Add Column" modal to let user select which label to map
 */
export const fetchGmailLabels = async () => {
  const response = await api.get('/mailboxes');
  // Backend returns labels array directly or in { data: labels }
  return Array.isArray(response.data) ? response.data : (response.data?.labels || []);
};

/**
 * WEEK 4: Fetch emails in a specific custom column
 * @param columnId - Column ID (e.g., "col_123", "todo", "done")
 */
export const fetchColumnEmails = async (columnId: string, options?: { limit?: number }) => {
  const response = await api.get(`/kanban/columns/${columnId}/emails`, {
    params: { limit: options?.limit || 50 }
  });
  return response.data;
};

/**
 * DEPRECATED: Fetch emails by old hardcoded status
 * Use fetchColumnEmails instead
 * @param status - Column status: TODO, IN_PROGRESS, DONE
 */
export const fetchKanbanColumnEmails = async (
  status: "TODO" | "IN_PROGRESS" | "DONE"
) => {
  const response = await api.get(`/kanban/columns/${status}/emails`);
  return response.data;
};

/**
 * Fetch inbox emails from Gmail
 */
export const fetchInboxEmails = async (limit = 50) => {
  const response = await api.get("/mail/inbox", { params: { limit } });
  console.log("Fetched inbox emails:", response.data);
  return response.data;
};

/**
 * Fetch single email detail by ID
 * @param emailId - Gmail message ID
 */
export const fetchEmailById = async (emailId: string) => {
  const response = await api.get(`/emails/${emailId}`);
  return response.data;
};

/**
 * Fetch snoozed emails
 */
export const fetchSnoozedEmails = async () => {
  const response = await api.get("/emails/snoozed");
  return response.data;
};

/**
 * WEEK 4: Move email between Kanban columns (Dynamic)
 * @param emailId - Gmail message ID
 * @param fromColumnId - Source column ID (or "inbox")
 * @param toColumnId - Destination column ID
 */
export const moveEmail = async (
  emailId: string,
  fromColumnId: string,
  toColumnId: string
) => {
  const response = await api.post('/kanban/move', {
    emailId,
    fromColumnId,
    toColumnId,
    optimistic: true
  });
  return response.data;
};

/**
 * DEPRECATED: Old moveEmailToColumn - kept for backward compatibility
 * Use moveEmail instead
 */
export const moveEmailToColumn = async (
  emailId: string,
  threadId: string,
  fromColumnId: string | null,
  toColumnId: string | null,
  toStatus: string
) => {
  const response = await api.post(`/emails/${emailId}/move`, {
    threadId,
    fromColumnId,
    toColumnId,
    toStatus,
  });
  return response.data;
};

/**
 * WEEK 4: Create new Kanban column
 */
export const createKanbanColumn = async (data: {
  name: string;
  gmailLabel?: string;
  color?: string;
  createNewLabel?: boolean; // Flag to create new label on Gmail
}) => {
  const response = await api.post('/kanban/columns', data);
  return response.data;
};

/**
 * WEEK 4: Update Kanban column
 */
export const updateKanbanColumn = async (
  columnId: string,
  data: { name?: string; gmailLabel?: string; color?: string; isVisible?: boolean }
) => {
  const response = await api.put(`/kanban/columns/${columnId}`, data);
  return response.data;
};

/**
 * WEEK 4: Delete Kanban column
 */
export const deleteKanbanColumn = async (columnId: string) => {
  const response = await api.post(`/kanban/columns/${columnId}/delete`);
  // Backend sometimes returns an object with { status: 500, message } but HTTP 200.
  // Treat non-200 `response.data.status` as an error so callers can rollback.
  if (response?.data && typeof response.data.status !== 'undefined' && response.data.status !== 200) {
    const msg = response.data.message || 'Failed to delete column';
    throw new Error(msg);
  }

  return response.data;
};

/**
 * WEEK 4: Reorder Kanban columns
 */
export const reorderKanbanColumns = async (columnOrder: string[]) => {
  const response = await api.post('/kanban/columns/reorder', { columnOrder });
  return response.data;
};

/**
 * Generate AI summary for an email
 * @param emailId - Gmail message ID
 * @param forceRegenerate - Force regenerate summary even if exists
 * @param structured - Return structured output with urgency/action
 */
export const generateEmailSummary = async (
  emailId: string,
  forceRegenerate = false,
  structured = false
) => {
  const response = await api.post(`/emails/${emailId}/summarize`, {
    forceRegenerate,
    structured,
  });
  return response.data;
};

/**
 * Snooze an email
 * @param emailId - Gmail message ID
 * @param threadId - Gmail thread ID
 * @param snoozedUntil - ISO date string when to wake up
 */
export const snoozeEmail = async (
  emailId: string,
  threadId: string,
  snoozedUntil: string
) => {
  const response = await api.post(`/emails/${emailId}/snooze`, {
    threadId,
    snoozedUntil,
  });
  return response.data;
};

/**
 * Unsnooze an email manually
 * @param emailId - Gmail message ID
 */
export const unsnoozeEmail = async (emailId: string) => {
  const response = await api.post(`/emails/${emailId}/unsnooze`);
  return response.data;
};

/**
 * 🔥 NEW: Get hybrid search suggestions (FAST - Atlas Search)
 * 
 * Performance: <200ms (vs old API ~3-5s)
 * Uses MongoDB Atlas Search Index instead of Gmail API
 * Ensures minimum 3 suggestions with smart balancing
 * 
 * @param prefix - Search prefix (minimum 2 characters)
 * @param limitTopHits - Max top hits (default: 3)
 * @param limitKeywords - Max keywords (default: 8)
 * @returns Hybrid suggestions with top hits and keywords
 */
export const getHybridSuggestions = async (
  prefix: string,
  limitTopHits: number = 3,
  limitKeywords: number = 8
): Promise<{
  topHits: Array<{
    type: 'email';
    emailId: string;
    threadId: string;
    from: string;
    subject: string;
    snippet: string;
    date: Date;
    score: number;
  }>;
  keywords: Array<{
    type: 'keyword';
    value: string;
    emailCount: number;
    category?: string;
  }>;
  totalResults: number;
  processingTimeMs: number;
}> => {
  const response = await api.get(`/search/hybrid-suggestions`, {
    params: { prefix, limitTopHits, limitKeywords }
  });
  return response.data.data || { topHits: [], keywords: [], totalResults: 0, processingTimeMs: 0 };
};

/**
 * ⚠️ DEPRECATED: Get search suggestions (SLOW - Gmail API)
 * 
 * Use getHybridSuggestions() instead for better performance
 * 
 * @deprecated Use getHybridSuggestions() instead
 * @param prefix - Search prefix (minimum 2 characters)
 * @param limit - Maximum number of suggestions (default: 5)
 * @returns Array of suggestions with value and type
 */
export const getSearchSuggestions = async (
  prefix: string,
  limit: number = 5
): Promise<Array<{ value: string; type: 'sender' | 'subject' }>> => {
  const response = await api.get(`/search/suggestions`, {
    params: { prefix, limit }
  });
  return response.data.data || [];
};

/**
 * WEEK 4: Remap column to different Gmail label (Recovery)
 */
export const remapColumnLabel = async (
  columnId: string,
  data: {
    newGmailLabel?: string;
    createNewLabel?: boolean;
    labelName?: string;
    color?: string;
  }
) => {
  const response = await api.post(`/kanban/columns/${columnId}/remap-label`, data);
  return response.data;
};

/**
 * WEEK 4: Clear column error state
 */
export const clearColumnError = async (columnId: string) => {
  const response = await api.post(`/kanban/columns/${columnId}/clear-error`);
  return response.data;
};

export default api;
