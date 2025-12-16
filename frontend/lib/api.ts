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
 * Fetch emails by column/status
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
 * Move email between Kanban columns
 * @param emailId - Gmail message ID
 * @param threadId - Gmail thread ID
 * @param toStatus - Destination status (INBOX, TODO, IN_PROGRESS, DONE)
 */
export const moveEmailToColumn = async (
  emailId: string,
  threadId: string,
  toStatus: string
) => {
  const response = await api.post(`/emails/${emailId}/move`, {
    threadId,
    toStatus,
  });
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

export default api;
