// ========================================
// AXIOS API CLIENT
// ========================================
// Features:
// - Auto attach access token to requests (Authorization: Bearer)
// - Auto refresh token on 401 Unauthorized
// - Concurrency handling: multiple failed requests trigger only one refresh
// - Refresh token sent from localStorage in request body (per assignment)
// ========================================

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, setAccessToken, clearTokens } from './token';

// Base URL từ environment variable
const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:5000';

// Create axios instance
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
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
    const token = getAccessToken();
    
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
    console.log('[API] Attempting to refresh token from HttpOnly cookie...');
    console.log('[API] Visible cookies:', document.cookie);
    
    // Call refresh endpoint - refreshToken sent via HttpOnly cookie
    const response = await axios.post(
      `${BASE_URL}/auth/refresh`,
      {},
      {
        headers: { 'Content-Type': 'application/json' },
        withCredentials: true, // CRITICAL: Send cookies with request
      }
    );
    
    const { accessToken } = response.data;
    console.log('[API] Token refresh successful!');
    
    // Save new access token
    setAccessToken(accessToken);
    
    return accessToken;
  } catch (error: any) {
    console.error('[API] Token refresh failed:', error?.response?.status, error?.response?.data);
    
    // Refresh failed → logout user
    clearTokens();
    
    // DON'T redirect automatically - let the app handle it
    // The useUserQuery will set isAuthenticated=false and the page will redirect
    
    throw error;
  }
};

api.interceptors.response.use(
  (response) => response, // Pass through successful responses
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    
    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Nếu là lỗi từ auth endpoints, reject ngay lập tức
    // Không cần retry vì auth endpoints không cần refresh token
    if (
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/register') ||
      originalRequest.url?.includes('/auth/refresh')
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

export default api;
