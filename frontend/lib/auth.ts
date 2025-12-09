// ========================================
// AUTHENTICATION API FUNCTIONS
// ========================================
// API calls to backend auth endpoints
// Tokens are managed by AuthContext (in-memory) and HttpOnly cookies
// ========================================

import api from './api';
import { clearTokens } from './token';
import { LoginCredentials, RegisterCredentials, LoginResponse, User } from '@/types/auth.types';

/**
 * Login với email và password
 * 
 * Flow:
 * 1. POST /auth/login với credentials
 * 2. Backend validates
 * 3. Backend returns: { accessToken, user } + sets HttpOnly cookie for refreshToken
 * 4. Frontend saves accessToken to AuthContext (in-memory)
 * 5. RefreshToken automatically stored in HttpOnly cookie by backend
 * 
 * Security:
 * 🔒 Access token: In-memory only (AuthContext)
 * 🔒 Refresh token: HttpOnly cookie (immune to XSS)
 */
export const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
  const response = await api.post<LoginResponse>('/auth/login', credentials);
  const { accessToken, user } = response.data;
  
  // Access token will be saved by the calling hook (useLoginMutation)
  // Refresh token is automatically set as HttpOnly cookie by backend
  
  return { accessToken, refreshToken: '', user };  // refreshToken empty (in cookie)
};

/**
 * Register user mới
 * 
 * Flow:
 * 1. POST /users/register với user info
 * 2. Backend creates user
 * 3. Return user info (không login tự động)
 * 4. Frontend redirect to login page
 */
export const register = async (credentials: RegisterCredentials): Promise<User> => {
  const response = await api.post<User>('/users/register', credentials);
  return response.data;
};

/**
 * Login với Google OAuth
 * 
 * @param code - Google authorization code
 * Flow:
 * 1. POST /auth/google với code
 * 2. Backend exchanges code with Google, gets tokens
 * 3. Backend stores Google refresh token in database
 * 4. Backend sets app refreshToken as HttpOnly cookie
 * 5. Backend returns: { accessToken, user }
 * 6. Frontend saves accessToken to AuthContext (in-memory)
 * 
 * Security:
 * 🔒 Access token: In-memory only (AuthContext)
 * 🔒 Refresh token: HttpOnly cookie (immune to XSS)
 * 🔒 Google refresh token: Database (server-side only)
 */
export const loginWithGoogle = async (code: string): Promise<LoginResponse> => {
  const response = await api.post<{ accessToken: string; user: User }>('/auth/google', { code });
  const { accessToken, user } = response.data;
  
  // Access token will be saved by the calling hook (useGoogleLoginMutation)
  // Refresh token is automatically set as HttpOnly cookie by backend
  
  return { accessToken, refreshToken: '', user };  // refreshToken empty (in cookie)
};

/**
 * Logout user
 * 
 * Flow:
 * 1. POST /auth/logout (refresh_token sent automatically via HttpOnly cookie)
 * 2. Backend revokes refresh token trong database
 * 3. Backend clears HttpOnly cookie
 * 4. Frontend clears AuthContext (in-memory access token)
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
