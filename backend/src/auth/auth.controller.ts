import { Body, Controller, Post, Req, UnauthorizedException, BadRequestException, Get, Query, Res } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { GmailSyncService } from '../mail/gmail-sync.service';
import { LoginDto } from './dto/login.dto';
import { google } from 'googleapis';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService, 
    private usersService: UsersService,
    private gmailSyncService: GmailSyncService
  ) {}

  @Post('login')
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { email, password } = body;
    const result = await this.authService.loginLocal(email, password);
    
    // Set refresh token as HttpOnly, Secure cookie (persistent, 7 days)
    const cookieOptions = {
      httpOnly: true,        // Prevent XSS access
      secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
      sameSite: 'lax' as const,  // CSRF protection
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days (persistent cookie)
      path: '/',             // Available across entire domain
    };
    res.cookie('refreshToken', result.refreshToken, cookieOptions);
    
    // Return access token + user (omit refreshToken from body since it's in cookie)
    return {
      accessToken: result.accessToken,
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
    };
  }

  @Post('google')
  async google(@Body() body: { code?: string; token?: string }, @Res({ passthrough: true }) res: Response) {
    // Accept authorization code (recommended) or legacy token (mock)
    if (!body.code && !body.token) throw new UnauthorizedException('Google code or token missing');
    
    const result = await this.authService.exchangeGoogleToken({ code: body.code });
    
    // Set app refresh token as HttpOnly, Secure cookie (persistent, 7 days)
    const cookieOptions = {
      httpOnly: true,        // Prevent XSS access
      secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
      sameSite: 'lax' as const,  // CSRF protection
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days (persistent cookie)
      path: '/',             // Available across entire domain
    };
    res.cookie('refreshToken', result.refreshToken, cookieOptions);
    
    // Return access token + user (omit refreshToken from body since it's in cookie)
    return {
      accessToken: result.accessToken,
      user: { id: result.user._id?.toString() || result.user.id, email: result.user.email, name: result.user.name },
    };
  }

  // @Post('google')
  // async google(@Body() body: { token?: string; email?: string; name?: string }) {
  //   // Accept either a third-party token (not validated here) or direct email+name for mocking
  //   if (!body.email) throw new UnauthorizedException('Google token missing');
  //   return this.authService.exchangeGoogleToken({ email: body.email, name: body.name });
  // }

  // Build Google OAuth consent URL; if ?redirect=true is provided, this endpoint will
  // redirect the browser to Google consent directly. Otherwise it returns JSON { url }.
  @Get('google/url')
  async googleUrl(@Query('redirect') redirect?: string, @Query('state') state?: string, @Res() res?: Response) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback';
    if (!clientId) throw new BadRequestException('Google OAuth not configured');

    const scope = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/gmail.readonly',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'consent',
    });
    if (state) params.set('state', state);

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    if (redirect && res) {
      return res.redirect(url);
    }
    return { url };
  }

  // Simple single-call entrypoint for frontend: frontend opens this URL and backend
  // redirects to Google consent flow. After consent Google will call
  // GET /auth/google/callback which completes the exchange and redirects to frontend.
  @Get('google')
  async googleRedirect(@Query('state') state?: string, @Res() res?: Response) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback';
    if (!clientId) throw new BadRequestException('Google OAuth not configured');

    const scope = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/gmail.readonly',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'consent',
    });
    if (state) params.set('state', state);

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return res.redirect(url);
  }

  // Google will redirect the browser to this endpoint with ?code=...; this handler
  // exchanges the code and then redirects the browser to the frontend with app tokens
  // encoded in the query string (or fragment). WARNING: returning tokens in URL is
  // less secure—consider using cookies or postMessage from frontend.
  @Get('google/callback')
  async googleCallbackGet(@Query('code') code?: string, @Query('redirectTo') redirectTo?: string, @Res() res?: Response) {
    if (!code) throw new BadRequestException('Missing authorization code');

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback';
    if (!clientId || !clientSecret) throw new BadRequestException('Google OAuth not configured');

    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
    const info = await oauth2.userinfo.get();
    const email = info.data.email;
    const name = info.data.name || undefined;
    if (!email) throw new BadRequestException('Unable to determine Google account email');

    let user = await this.usersService.findByEmail(email);
    if (!user) {
      user = await this.usersService.createFromOAuth({ email, name });
    }
    if (tokens.refresh_token) {
      await this.usersService.setGoogleRefreshToken(user._id.toString(), tokens.refresh_token);
    }

    const session = this.authService.createSessionForUser({ id: user._id.toString(), email: user.email });

    const target = redirectTo || process.env.FE_URL || 'http://localhost:3000';
    // Set refresh token as HttpOnly, Secure cookie and redirect to frontend without tokens in URL
    const cookieOptions = {
      httpOnly: true,        // Prevent XSS access
      secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
      sameSite: 'lax' as const,  // CSRF protection
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days (persistent cookie)
      path: '/',             // Available across entire domain
    };
    if (res) {
      res.cookie('refreshToken', session.refreshToken, cookieOptions);
      // Optionally the frontend can then call POST /auth/refresh to get an access token.
      return res.redirect(target + '?auth=success');
    }
    return { user: { id: user._id.toString(), email: user.email, name: user.name }, tokens: { accessToken: session.accessToken } };
  }

  @Post('google/callback')
  async googleCallback(@Body() body: { code?: string; redirectUri?: string }) {
    const code = body.code;
    if (!code) throw new BadRequestException('Missing authorization code');

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = body.redirectUri || process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback';
    if (!clientId || !clientSecret) throw new BadRequestException('Google OAuth not configured');

    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // fetch userinfo
    const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
    const res = await oauth2.userinfo.get();
    const email = res.data.email;
    const name = res.data.name || undefined;
    if (!email) throw new BadRequestException('Unable to determine Google account email');

    // find or create app user
    let user = await this.usersService.findByEmail(email);
    if (!user) {
      user = await this.usersService.createFromOAuth({ email, name });
    }

    // persist Google refresh token if provided
    if (tokens.refresh_token) {
      await this.usersService.setGoogleRefreshToken(user._id.toString(), tokens.refresh_token);
    }

    // create app session tokens
    const session = this.authService.createSessionForUser({ id: user._id.toString(), email: user.email });

    // 🔥 AUTO-SYNC: Trigger Gmail sync after successful OAuth
    // This runs in background and doesn't block the response
    const userId = user._id.toString();
    this.gmailSyncService.syncAllLabels(userId, 100).catch(err => {
      console.error(`[Auth] Auto-sync failed for user ${userId}:`, err.message);
      // Don't fail the login, just log the error
    });

    return {
      user: { id: user._id.toString(), email: user.email, name: user.name },
      tokens: session,
      googleTokens: { hasRefreshToken: !!tokens.refresh_token },
    };
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken?: string }, @Req() req?: Request) {
    const token = body?.refreshToken || (req && (req as any).cookies && (req as any).cookies.refreshToken);
    if (!token) throw new BadRequestException('Missing refresh token');
    return this.authService.refresh(token);
  }

  @Post('logout')
  async logout(@Body() body: { refreshToken?: string }, @Req() req?: Request, @Res({ passthrough: true }) res?: Response) {
    const token = body?.refreshToken || (req && (req as any).cookies && (req as any).cookies.refreshToken);
    
    if (token) {
      // Decode token to get userId for OAuth revocation
      let userId: string | null = null;
      try {
        const jwt = require('jsonwebtoken');
        const decoded: any = jwt.decode(token);
        userId = decoded?.sub;
      } catch (err) {
        // Token invalid, continue with cleanup
      }

      // Revoke refresh token in database
      await this.authService.logout(token);
      
      // Revoke Google OAuth refresh token if exists
      if (userId) {
        await this.authService.revokeGoogleRefreshToken(userId);
      }
    }
    
    // Clear refresh token cookie with same attributes used when setting
    if (res) {
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
      });
    }
    
    return { ok: true };
  }
}
