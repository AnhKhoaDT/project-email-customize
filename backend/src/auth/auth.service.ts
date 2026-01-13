import { Injectable, UnauthorizedException, Inject, forwardRef } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { UsersService } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import * as bcrypt from 'bcrypt';
import { google } from 'googleapis';
import { AutoIndexingService } from '../mail/auto-indexing.service';
import { GmailService } from '../mail/gmail.service';


const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'access-secret-example';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'refresh-secret-example';
const ACCESS_EXPIRES_IN = '15m';
const REFRESH_EXPIRES_IN = '7d';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService, 
    private sessionsService: SessionsService,
    @Inject(forwardRef(() => AutoIndexingService))
    private autoIndexingService: AutoIndexingService,
    @Inject(forwardRef(() => GmailService))
    private gmailService: GmailService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return null;
    return { id: user._id.toString(), email: user.email, name: user.name };
  }

  signAccessToken(payload: object) {
    return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
  }

  signRefreshToken(payload: object) {
    return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
  }

  async loginLocal(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const accessToken = this.signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = this.signRefreshToken({ sub: user.id });
    await this.sessionsService.createOrReplace(refreshToken, user.id);
    
    // Trigger auto-indexing for first-time users
    this.triggerAutoIndexing(user.id).catch(err => {
      console.error(`[Auth] Auto-indexing failed for user ${user.id}:`, err.message);
    });
    
    return { accessToken, refreshToken, user };
  }

  // helper to fetch Google userinfo from an OAuth2 client
  private async getGoogleUserInfo(oauthClient: any) {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauthClient });
    const res = await oauth2.userinfo.get();
    return res.data; // { id, email, name, picture, ... }
  }

  // Exchange authorization code or accept legacy email payload. Returns app session tokens.
  async exchangeGoogleToken(payload: { code?: string; email?: string; name?: string }) {
    // If authorization code is provided, perform server-side exchange
    if (payload.code) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      // For client-side auth-code flow, use 'postmessage' or the frontend URL
      const redirectUri = 'postmessage';
      if (!clientId || !clientSecret) throw new UnauthorizedException('Google OAuth not configured');

      const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      const { tokens } = await oAuth2Client.getToken(payload.code);
      oAuth2Client.setCredentials(tokens);

      const info = await this.getGoogleUserInfo(oAuth2Client);
      const email = info.email;
      const name = info.name || payload.name || undefined;
      if (!email) throw new UnauthorizedException('Unable to determine Google account email');

      let user = await this.usersService.findByEmail(email);
      if (!user) {
        user = await this.usersService.createFromOAuth({ email, name });
      }

      if (tokens.refresh_token) {
        await this.usersService.setGoogleRefreshToken(user._id.toString(), tokens.refresh_token);
      }

      const accessToken = this.signAccessToken({ sub: user._id.toString(), email: user.email });
      const refreshToken = this.signRefreshToken({ sub: user._id.toString() });
      await this.sessionsService.createOrReplace(refreshToken, user._id.toString());

      // Trigger auto-indexing for first-time users
      this.triggerAutoIndexing(user._id.toString()).catch(err => {
        console.error(`[Auth] Auto-indexing failed for user ${user._id}:`, err.message);
      });

      return { accessToken, refreshToken, user };
    }

    // Legacy/mock: accept email/name directly
    if (payload.email) {
      let user = await this.usersService.findByEmail(payload.email);
      if (!user) {
        user = await this.usersService.createFromOAuth({ email: payload.email, name: payload.name || 'Google User' });
      }
      const userId = user._id.toString();
      const accessToken = this.signAccessToken({ sub: userId, email: user.email });
      const refreshToken = this.signRefreshToken({ sub: userId });
      await this.sessionsService.createOrReplace(refreshToken, userId);
      
      // Trigger auto-indexing for first-time users
      this.triggerAutoIndexing(userId).catch(err => {
        console.error(`[Auth] Auto-indexing failed for user ${userId}:`, err.message);
      });
      
      return { accessToken, refreshToken, user };
    }

    throw new UnauthorizedException('Invalid Google payload');
  }

  createSessionForUser(user: { id: string; email: string }) {
    const accessToken = this.signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = this.signRefreshToken({ sub: user.id });
    // create persistent session record
    this.sessionsService.createOrReplace(refreshToken, user.id).catch(() => {});
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    try {
      const payload: any = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
      const session = await this.sessionsService.findByToken(refreshToken);
      if (!session || session.revoked) throw new UnauthorizedException('Invalid refresh token');
      if (session.user.toString() !== payload.sub) throw new UnauthorizedException('Invalid refresh token (mismatch)');
      const user = await this.usersService.findById(payload.sub);
      if (!user) throw new UnauthorizedException('User not found');
      const accessToken = this.signAccessToken({ sub: user._id.toString(), email: user.email });
      return { accessToken };
    } catch (err) {
      throw new UnauthorizedException('Refresh failed');
    }
  }

  async logout(refreshToken: string) {
    // Delete session from database
    await this.sessionsService.deleteByToken(refreshToken).catch(() => {});
  }

  /**
   * Trigger auto-indexing for users on login
   * Queues 50-100 recent emails for background indexing
   */
  private async triggerAutoIndexing(userId: string): Promise<void> {
    try {
      console.log(`[Auth] 🚀 Queueing emails for auto-indexing (user: ${userId})...`);
      
      // Fetch 100 most recent emails from inbox
      const inboxData = await this.gmailService.listMessagesInLabel(userId, 'INBOX', 100);
      
      if (!inboxData?.messages || inboxData.messages.length === 0) {
        console.log(`[Auth] No emails found for user ${userId}, skipping auto-indexing`);
        return;
      }

      const emailIds = inboxData.messages.map(m => m.id).filter(Boolean);
      
      // Queue emails with HIGH priority (user just logged in)
      await this.autoIndexingService.queueBatch(userId, emailIds, 'high');
      
      console.log(`[Auth] ✅ Queued ${emailIds.length} emails for indexing (user: ${userId})`);
      
      // Mark user as indexed (will be indexed soon)
      const user = await this.usersService.findById(userId);
      if (user && !user.isSemanticSearchIndexed) {
        await this.usersService.markAsIndexed(userId);
      }
      
    } catch (err) {
      // Silent failure - don't break login
      console.error(`[Auth] Failed to queue auto-indexing:`, err.message);
    }
  }

  /**
   * Revoke Google OAuth refresh token
   * Call this during logout to revoke Google access
   */
  async revokeGoogleRefreshToken(userId: string) {
    try {
      const user = await this.usersService.findById(userId);
      if (!user?.googleRefreshToken) {
        return; // No Google token to revoke
      }

      // Use Google API client to revoke token
      const { google } = require('googleapis');
      const oauth2Client = new google.auth.OAuth2();
      
      // Revoke the refresh token
      await oauth2Client.revokeToken(user.googleRefreshToken);

      // Clear the stored Google refresh token
      await this.usersService.setGoogleRefreshToken(userId, '');
      
      console.log(`✅ Successfully revoked Google token for user ${userId}`);
    } catch (err) {
      // Log but don't throw - logout should succeed even if revocation fails
      console.error('Failed to revoke Google token:', err.message);
    }
  }
}
