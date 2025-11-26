// ========================================
// AUTHENTICATION API FUNCTIONS
// ========================================
// Các functions để gọi backend auth endpoints
// ========================================

import api from './api';
import { setAccessToken, setRefreshToken, clearTokens } from './token';
import { LoginCredentials, RegisterCredentials, LoginResponse, User } from '@/types/auth.types';

/**
 * Login với email và password
 * 
 * Flow:
 * 1. POST /auth/login với credentials
 * 2. Backend validates
 * 3. Backend returns: { accessToken, refreshToken, user }
 * 4. Frontend lưu cả accessToken và refreshToken vào localStorage
 * 
 * Note: Per assignment requirement, refreshToken is stored in localStorage
 */
export const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
  const response = await api.post<LoginResponse>('/auth/login', credentials);
  const { accessToken, refreshToken, user } = response.data;
  
  // Save access token (localStorage + cookie for middleware)
  setAccessToken(accessToken);
  
  // Save refresh token (localStorage - per assignment requirement)
  setRefreshToken(refreshToken);
  
  return { accessToken, refreshToken, user };
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
  const { accessToken, refreshToken, user } = response.data;
  
  // Save both tokens
  setAccessToken(accessToken);
  setRefreshToken(refreshToken);
  
  return { accessToken, refreshToken, user };
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
  const response = await api.get<User>('/users/me');
  return response.data;
};
