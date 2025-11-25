import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { UsersService } from '../users/users.service';

const logger = new Logger('GmailService');

@Injectable()
export class GmailService {
  private oauth2Client: any;

  constructor(private usersService: UsersService) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  private async getOAuthClientForUser(userId: string) {
    const refreshToken = await this.usersService.getGoogleRefreshToken(userId);
    if (!refreshToken) throw new Error('No Google refresh token for user');
    const client = this.oauth2Client;
    client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  async listLabels(userId: string) {
    const client = await this.getOAuthClientForUser(userId);
    const gmail = google.gmail({ version: 'v1', auth: client });
    const res = await gmail.users.labels.list({ userId: 'me' });
    return res.data.labels || [];
  }

  async listMessagesInLabel(userId: string, labelId: string, pageSize = 20, pageToken?: string) {
    const client = await this.getOAuthClientForUser(userId);
    const gmail = google.gmail({ version: 'v1', auth: client });
    const res = await gmail.users.messages.list({ userId: 'me', labelIds: [labelId], maxResults: pageSize, pageToken });
    return res.data;
  }

  async getMessage(userId: string, messageId: string) {
    const client = await this.getOAuthClientForUser(userId);
    const gmail = google.gmail({ version: 'v1', auth: client });
    const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    return res.data;
  }
}
