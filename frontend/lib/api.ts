// ========================================
// AXIOS API CLIENT
// ========================================
// Features:
// - Auto attach access token to requests
// - Auto refresh token khi 401
// - withCredentials: true (gửi HTTP-only cookie)
// ========================================

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, setAccessToken, clearTokens } from './token';

// Base URL từ environment variable
const BASE_URL = process.env.BACKEND_API_URL || 'http://localhost:3001';

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
 * Backend sẽ đọc refresh token từ HTTP-only cookie
 */
const refreshAccessToken = async (): Promise<string> => {
  try {
    // Call refresh endpoint
    // withCredentials: true → tự động gửi refresh_token cookie
    const response = await axios.post(
      `${BASE_URL}/auth/refresh`,
      {},
      {
        withCredentials: true,
        headers: { 'Content-Type': 'application/json' },
      }
    );
    
    const { accessToken } = response.data;
    
    // Save new access token
    setAccessToken(accessToken);
    
    return accessToken;
  } catch (error) {
    // Refresh failed → logout user
    clearTokens();
    
    // Redirect to login
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    
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
