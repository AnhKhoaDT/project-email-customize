import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ========================================
// MIDDLEWARE - DISABLED FOR IN-MEMORY TOKENS
// ========================================
// Since access tokens are now stored in-memory only (not in cookies),
// middleware cannot check authentication state.
// Auth protection is handled client-side in page components via useUserQuery.
// ========================================

export function middleware(request: NextRequest) {
  // Allow all requests - auth protection handled client-side
  // Client-side protection:
  // 1. useUserQuery checks accessToken in AuthContext
  // 2. If no token, tries to refresh from HttpOnly cookie
  // 3. If refresh fails, redirects to login
  return NextResponse.next();
}

// Configure which routes should trigger the middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|public).*)',
  ],
};
