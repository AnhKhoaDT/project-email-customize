// ========================================
// AUTHENTICATION API FUNCTIONS
// ========================================
// Các functions để gọi backend auth endpoints
// ========================================

import api from './api';
import { setAccessToken, clearTokens } from './token';
import { LoginCredentials, RegisterCredentials, LoginResponse, User } from '@/types/auth.types';

/**
 * Login với email và password
 * 
 * Flow:
 * 1. POST /auth/login với credentials
 * 2. Backend validates
 * 3. Backend returns: { accessToken, user }
 * 4. Backend sets HTTP-only cookie: refresh_token
 * 5. Frontend lưu accessToken
 */
export const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
  const response = await api.post<LoginResponse>('/auth/login', credentials);
  const { accessToken, user } = response.data;
  
  // Lưu access token (localStorage + cookie)
  setAccessToken(accessToken);
  
  // Note: Refresh token được backend set vào HTTP-only cookie tự động
  
  return { accessToken, user };
};

/**
 * Register user mới
 * 
 * Flow:
 * 1. POST /auth/register với user info
 * 2. Backend creates user
 * 3. Return user info (không login tự động)
 * 4. Frontend redirect to login page
 */
export const register = async (credentials: RegisterCredentials): Promise<User> => {
  const response = await api.post<User>('/auth/register', credentials);
  return response.data;
};

/**
 * Login với Google OAuth
 * 
 * @param token - Google OAuth token
 */
export const loginWithGoogle = async (token: string): Promise<LoginResponse> => {
  const response = await api.post<LoginResponse>('/auth/google', { token });
  const { accessToken, user } = response.data;
  
  setAccessToken(accessToken);
  
  return { accessToken, user };
};

/**
 * Logout user
 * 
 * Flow:
 * 1. POST /auth/logout (với refresh_token cookie)
 * 2. Backend revokes refresh token trong database
 * 3. Backend clears HTTP-only cookie
 * 4. Frontend clears access token
 * 5. Redirect to login
 */
export const logout = async (): Promise<void> => {
  try {
    // Call backend logout (backend sẽ clear HTTP-only cookie)
    await api.post('/auth/logout');
  } catch (error) {
    // Ignore errors, clear tokens anyway
    console.error('Logout API error:', error);
  } finally {
    // Always clear frontend tokens
    clearTokens();
  }
};

/**
 * Get current user profile
 * Dùng để restore session sau khi refresh page
 */
export const getCurrentUser = async (): Promise<User> => {
  const response = await api.get<{ user: User }>('/auth/me');
  return response.data.user;
};
