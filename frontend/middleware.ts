import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const protectedRoutes = ['/inbox'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Get access token from cookies
  const accessToken = request.cookies.get('access_token')?.value;
  
  // Check if the current route is protected
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  
  // If trying to access protected route without token, redirect to login
  if (isProtectedRoute && !accessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  // Allow access to all other routes (including /login and /register)
  // This allows users to logout and login with different accounts
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
