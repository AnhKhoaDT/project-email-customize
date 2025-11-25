import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { UsersService } from '../users/users.service';
import { parseEmailMessage } from './helper/email-parser.helper';

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
    
    const parsed = parseEmailMessage(res.data);
    return parsed;
  }

  async sendEmail(userId: string, payload: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    isHtml?: boolean;
    attachments?: Array<{ filename: string; content: string; contentType?: string }>;
  }) {
    const client = await this.getOAuthClientForUser(userId);
    const gmail = google.gmail({ version: 'v1', auth: client });

    // Build email message in RFC 2822 format
    const boundary = '----=_Part_' + Date.now();
    let message = '';
    
    // Headers
    message += `To: ${payload.to.join(', ')}\r\n`;
    if (payload.cc && payload.cc.length > 0) message += `Cc: ${payload.cc.join(', ')}\r\n`;
    if (payload.bcc && payload.bcc.length > 0) message += `Bcc: ${payload.bcc.join(', ')}\r\n`;
    message += `Subject: ${payload.subject}\r\n`;
    message += `MIME-Version: 1.0\r\n`;
    
    if (payload.attachments && payload.attachments.length > 0) {
      message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/${payload.isHtml ? 'html' : 'plain'}; charset="UTF-8"\r\n\r\n`;
      message += `${payload.body}\r\n\r\n`;
      
      // Add attachments
      for (const att of payload.attachments) {
        message += `--${boundary}\r\n`;
        message += `Content-Type: ${att.contentType || 'application/octet-stream'}; name="${att.filename}"\r\n`;
        message += `Content-Transfer-Encoding: base64\r\n`;
        message += `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n`;
        message += `${att.content}\r\n\r\n`;
      }
      message += `--${boundary}--`;
    } else {
      message += `Content-Type: text/${payload.isHtml ? 'html' : 'plain'}; charset="UTF-8"\r\n\r\n`;
      message += payload.body;
    }

    // Encode to base64url
    const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage }
    });
    
    return res.data;
  }

  async replyToEmail(userId: string, messageId: string, payload: {
    body: string;
    isHtml?: boolean;
    attachments?: Array<{ filename: string; content: string; contentType?: string }>;
  }) {
    const client = await this.getOAuthClientForUser(userId);
    const gmail = google.gmail({ version: 'v1', auth: client });

    // Get original message to extract headers
    const originalMsg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'metadata', metadataHeaders: ['From', 'To', 'Subject', 'Message-ID', 'References'] });
    const headers = originalMsg.data.payload?.headers || [];
    
    const fromHeader = headers.find(h => h.name?.toLowerCase() === 'from');
    const subjectHeader = headers.find(h => h.name?.toLowerCase() === 'subject');
    const messageIdHeader = headers.find(h => h.name?.toLowerCase() === 'message-id');
    const referencesHeader = headers.find(h => h.name?.toLowerCase() === 'references');
    
    const to = fromHeader?.value || '';
    const subject = subjectHeader?.value?.startsWith('Re:') ? subjectHeader.value : `Re: ${subjectHeader?.value || ''}`;
    const inReplyTo = messageIdHeader?.value || '';
    const references = referencesHeader?.value ? `${referencesHeader.value} ${inReplyTo}` : inReplyTo;

    // Build reply message
    const boundary = '----=_Part_' + Date.now();
    let message = '';
    
    message += `To: ${to}\r\n`;
    message += `Subject: ${subject}\r\n`;
    message += `In-Reply-To: ${inReplyTo}\r\n`;
    message += `References: ${references}\r\n`;
    message += `MIME-Version: 1.0\r\n`;
    
    if (payload.attachments && payload.attachments.length > 0) {
      message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/${payload.isHtml ? 'html' : 'plain'}; charset="UTF-8"\r\n\r\n`;
      message += `${payload.body}\r\n\r\n`;
      
      for (const att of payload.attachments) {
        message += `--${boundary}\r\n`;
        message += `Content-Type: ${att.contentType || 'application/octet-stream'}; name="${att.filename}"\r\n`;
        message += `Content-Transfer-Encoding: base64\r\n`;
        message += `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n`;
        message += `${att.content}\r\n\r\n`;
      }
      message += `--${boundary}--`;
    } else {
      message += `Content-Type: text/${payload.isHtml ? 'html' : 'plain'}; charset="UTF-8"\r\n\r\n`;
      message += payload.body;
    }

    const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { 
        raw: encodedMessage,
        threadId: originalMsg.data.threadId
      }
    });
    
    return res.data;
  }

  async modifyMessage(userId: string, messageId: string, action: string) {
    const client = await this.getOAuthClientForUser(userId);
    const gmail = google.gmail({ version: 'v1', auth: client });

    let addLabelIds: string[] = [];
    let removeLabelIds: string[] = [];

    switch (action) {
      case 'markRead':
        removeLabelIds = ['UNREAD'];
        break;
      case 'markUnread':
        addLabelIds = ['UNREAD'];
        break;
      case 'star':
        addLabelIds = ['STARRED'];
        break;
      case 'unstar':
        removeLabelIds = ['STARRED'];
        break;
      case 'delete':
        removeLabelIds = ['INBOX'];
        addLabelIds = ['TRASH'];
        break;
      case 'archive':
        removeLabelIds = ['INBOX'];
        break;
      case 'unarchive':
        addLabelIds = ['INBOX'];
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const res = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds, removeLabelIds }
    });

    return res.data;
  }

  async toggleLabel(userId: string, labelId: string, emailIds: string[], action: 'add' | 'remove') {
    const client = await this.getOAuthClientForUser(userId);
    const gmail = google.gmail({ version: 'v1', auth: client });

    const addLabelIds = action === 'add' ? [labelId] : [];
    const removeLabelIds = action === 'remove' ? [labelId] : [];

    const res = await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: emailIds,
        addLabelIds,
        removeLabelIds
      }
    });

    return res.data;
  }

  async getAttachment(userId: string, messageId: string, attachmentId: string) {
    const client = await this.getOAuthClientForUser(userId);
    const gmail = google.gmail({ version: 'v1', auth: client });

    const res = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: messageId,
      id: attachmentId
    });

    return res.data;
  }
}
