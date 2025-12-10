import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { UsersService } from '../users/users.service';
import { parseEmailMessage} from './helper/email-parser.helper';

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

  // ============================================
  // KANBAN LABEL MANAGEMENT
  // ============================================

  /**
   * Tạo custom label trong Gmail
   * Gmail sẽ tự động lưu label này vào tài khoản user
   */
  async createLabel(userId: string, name: string, color?: { backgroundColor: string; textColor: string }) {
    const client = await this.getOAuthClientForUser(userId);
    const gmail = google.gmail({ version: 'v1', auth: client });
    
    try {
      const res = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
          color: color || {
            backgroundColor: '#16a765',
            textColor: '#ffffff'
          }
        }
      });
      
      logger.log(`✅ Created label "${name}" with ID: ${res.data.id}`);
      return res.data;
    } catch (err) {
      // Nếu label đã tồn tại, trả về label hiện có
      if (err.code === 409 || err.message?.includes('already exists')) {
        logger.log(`Label "${name}" already exists, fetching existing...`);
        const labels = await this.listLabels(userId);
        const existing = labels.find(l => l.name === name);
        return existing;
      }
      throw err;
    }
  }

  /**
   * Khởi tạo tất cả Kanban labels cần thiết
   * Gọi method này khi user login lần đầu hoặc khi cần setup
   */
  async initializeKanbanLabels(userId: string) {
    const kanbanLabels = [
      { name: 'TODO', color: { backgroundColor: '#fb4c2f', textColor: '#ffffff' } },      // Red
      { name: 'IN_PROGRESS', color: { backgroundColor: '#fad165', textColor: '#000000' } }, // Yellow
      { name: 'DONE', color: { backgroundColor: '#16a765', textColor: '#ffffff' } },       // Green
      { name: 'SNOOZED', color: { backgroundColor: '#a479e2', textColor: '#ffffff' } },    // Purple
    ];

    const createdLabels = [];
    
    for (const label of kanbanLabels) {
      try {
        const created = await this.createLabel(userId, label.name, label.color);
        createdLabels.push(created);
      } catch (err) {
        logger.error(`Failed to create label ${label.name}:`, err);
      }
    }

    logger.log(`✅ Initialized ${createdLabels.length} Kanban labels`);
    return createdLabels;
  }

  /**
   * Lấy Kanban labels của user
   * Labels này được LƯU TRONG GMAIL, không phải MongoDB
   */
  async getKanbanLabels(userId: string) {
    const allLabels = await this.listLabels(userId);
    
    // Filter chỉ lấy các labels Kanban
    const kanbanLabelNames = ['TODO', 'IN_PROGRESS', 'DONE', 'SNOOZED'];
    const kanbanLabels = allLabels.filter(label => 
      kanbanLabelNames.includes(label.name)
    );

    return kanbanLabels;
  }

  async listMessagesInLabel(userId: string, labelId: string, pageSize = 20, pageToken?: string) {
    const client = await this.getOAuthClientForUser(userId);
    const gmail = google.gmail({ version: 'v1', auth: client });
    
    // Lấy danh sách message IDs
    const res = await gmail.users.messages.list({ userId: 'me', labelIds: [labelId], maxResults: pageSize, pageToken });
    
    // Nếu không có messages thì return luôn
    if (!res.data.messages || res.data.messages.length === 0) {
      return {
        messages: [],
        nextPageToken: res.data.nextPageToken,
        resultSizeEstimate: res.data.resultSizeEstimate || 0
      };
    }
    
    // Fetch chi tiết cho từng message (với format metadata để nhanh hơn)
    const messagesWithDetails = await Promise.all(
      res.data.messages.map(async (msg: any) => {
        try {
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From', 'To', 'Date']
          });
          
          const headers = detail.data.payload?.headers || [];
          const getHeader = (name: string) => headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
          
          // Decode RFC 2047 encoded subject (fixes Vietnamese/non-ASCII characters)
          const decodeSubject = (subject: string): string => {
            if (!subject) return '(No Subject)';
            // Handle RFC 2047 encoding: =?charset?encoding?encoded-text?=
            return subject.replace(/=\?([^?]+)\?(B|Q)\?([^?]+)\?=/gi, (match, charset, encoding, encoded) => {
              try {
                if (encoding.toUpperCase() === 'B') {
                  // Base64 decoding
                  return Buffer.from(encoded, 'base64').toString(charset || 'utf-8');
                } else if (encoding.toUpperCase() === 'Q') {
                  // Quoted-printable decoding
                  return decodeURIComponent(encoded.replace(/=/g, '%'));
                }
              } catch (e) {
                return match;
              }
              return match;
            });
          };
          
          return {
            id: detail.data.id,
            threadId: detail.data.threadId,
            labelIds: detail.data.labelIds || [],
            snippet: detail.data.snippet || '',
            subject: decodeSubject(getHeader('Subject')),
            from: getHeader('From'),
            to: getHeader('To'),
            date: getHeader('Date'),
            sizeEstimate: detail.data.sizeEstimate,
            internalDate: detail.data.internalDate,
            isUnread: (detail.data.labelIds || []).includes('UNREAD'),
            isStarred: (detail.data.labelIds || []).includes('STARRED'),
            hasAttachment: (detail.data.payload?.parts || []).some((p: any) => p.filename && p.body?.attachmentId)
          };
        } catch (err) {
          logger.error(`Failed to fetch message ${msg.id}:`, err);
          // Fallback: trả về thông tin cơ bản
          return {
            id: msg.id,
            threadId: msg.threadId,
            labelIds: [],
            snippet: '',
            subject: '(Error loading)',
            from: '',
            to: '',
            date: '',
            sizeEstimate: 0,
            internalDate: '',
            isUnread: false,
            isStarred: false,
            hasAttachment: false
          };
        }
      })
    );
    
    return {
      messages: messagesWithDetails,
      nextPageToken: res.data.nextPageToken,
      resultSizeEstimate: res.data.resultSizeEstimate || 0
    };
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

  // ============================================
  // KANBAN WORKFLOW - MOVE EMAILS BETWEEN COLUMNS
  // ============================================

  /**
   * Move email giữa các Kanban columns
   * @param userId - User ID
   * @param messageId - Email ID cần move
   * @param fromColumn - Column hiện tại (optional) - sẽ remove label này
   * @param toColumn - Column đích - sẽ add label này
   * 
   * Ví dụ: moveEmailBetweenColumns(userId, emailId, 'TODO', 'DONE')
   * → Remove label TODO, Add label DONE
   */
  async moveEmailBetweenColumns(
    userId: string, 
    messageId: string, 
    fromColumn: string | null,
    toColumn: string
  ) {
    const client = await this.getOAuthClientForUser(userId);
    const gmail = google.gmail({ version: 'v1', auth: client });

    // Get all labels để tìm label IDs
    const allLabels = await this.listLabels(userId);
    
    // Tìm label IDs dựa trên tên
    const fromLabel = fromColumn ? allLabels.find(l => l.name === fromColumn) : null;
    const toLabel = allLabels.find(l => l.name === toColumn);

    if (!toLabel) {
      throw new Error(`Label "${toColumn}" not found. Please initialize Kanban labels first.`);
    }

    const addLabelIds = [toLabel.id];
    const removeLabelIds = fromLabel ? [fromLabel.id] : [];

    logger.log(`Moving email ${messageId}: ${fromColumn || 'none'} → ${toColumn}`);
    logger.log(`Remove labels: ${removeLabelIds.join(', ')}`);
    logger.log(`Add labels: ${addLabelIds.join(', ')}`);

    const res = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds, removeLabelIds }
    });

    return res.data;
  }

  /**
   * Get emails by Kanban column
   * @param userId - User ID
   * @param columnName - Tên column: 'TODO', 'IN_PROGRESS', 'DONE', 'SNOOZED'
   */
  async getEmailsByColumn(userId: string, columnName: string, pageSize = 50, pageToken?: string) {
    // Get label ID from column name
    const allLabels = await this.listLabels(userId);
    const columnLabel = allLabels.find(l => l.name === columnName);

    if (!columnLabel) {
      throw new Error(`Column "${columnName}" not found. Please initialize Kanban labels first.`);
    }

    // Reuse existing method
    return this.listMessagesInLabel(userId, columnLabel.id, pageSize, pageToken);
  }
}
