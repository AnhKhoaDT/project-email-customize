import { Controller, Get, Post, Body, Param, Query, Req, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GmailService } from './gmail.service';
import { AiService } from '../ai/ai.service';
import { SnoozeService } from './snooze.service';
import { EmailMetadataService } from './email-metadata.service';
import { FuzzySearchService } from './fuzzy-search.service';
import { SemanticSearchService } from './semantic-search.service';
import { KanbanConfigService } from './kanban-config.service';
import { SendEmailDto } from './dto/send-email.dto';
import { ReplyEmailDto } from './dto/reply-email.dto';
import { ModifyEmailDto } from './dto/modify-email.dto';
import { ToggleLabelDto } from './dto/toggle-label.dto';
import { SearchEmailDto } from './dto/search-email.dto';
import * as path from 'path';
import * as fs from 'fs';

function authGuard(req: any) {
  const auth = req.headers?.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  // Note: this mock guard does not verify JWT signature for simplicity; in production verify.
  return true;
}

function readJSON(p: string) {
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

@Controller()
export class MailController {
  private dataDir = path.join(__dirname, 'data');
  
  // Rate limiting: Track summarize requests per user
  // Map<userId, Array<timestamp>>
  private summarizeRateLimit = new Map<string, number[]>();
  private readonly MAX_REQUESTS_PER_MINUTE = 10;
  
  // Rate limiting: Track search requests per user
  private searchRateLimit = new Map<string, number[]>();
  private readonly MAX_SEARCH_REQUESTS_PER_MINUTE = 10;
  
  constructor(
    private gmailService: GmailService,
    private aiService: AiService,
    private snoozeService: SnoozeService,
    private emailMetadataService: EmailMetadataService,
    private fuzzySearchService: FuzzySearchService,
    private semanticSearchService: SemanticSearchService,
    private kanbanConfigService: KanbanConfigService,
  ) {}
  
  /**
   * Check if user has exceeded rate limit for summarize requests
   * @param userId - User ID
   * @returns true if rate limit exceeded, false otherwise
   */
  private checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    
    // Get user's request history
    let userRequests = this.summarizeRateLimit.get(userId) || [];
    
    // Remove requests older than 1 minute
    userRequests = userRequests.filter(timestamp => timestamp > oneMinuteAgo);
    
    // Update map
    this.summarizeRateLimit.set(userId, userRequests);
    
    // Check if limit exceeded
    const allowed = userRequests.length < this.MAX_REQUESTS_PER_MINUTE;
    const remaining = Math.max(0, this.MAX_REQUESTS_PER_MINUTE - userRequests.length);
    
    return { allowed, remaining };
  }
  
  /**
   * Record a summarize request for rate limiting
   * @param userId - User ID
   */
  private recordRequest(userId: string): void {
    const now = Date.now();
    const userRequests = this.summarizeRateLimit.get(userId) || [];
    userRequests.push(now);
    this.summarizeRateLimit.set(userId, userRequests);
  }
  
  /**
   * Check if user has exceeded rate limit for search requests
   * @param userId - User ID
   * @returns true if rate limit exceeded, false otherwise
   */
  private checkSearchRateLimit(userId: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    
    // Get user's request history
    let userRequests = this.searchRateLimit.get(userId) || [];
    
    // Remove requests older than 1 minute
    userRequests = userRequests.filter(timestamp => timestamp > oneMinuteAgo);
    
    // Update map
    this.searchRateLimit.set(userId, userRequests);
    
    // Check if limit exceeded
    const allowed = userRequests.length < this.MAX_SEARCH_REQUESTS_PER_MINUTE;
    const remaining = Math.max(0, this.MAX_SEARCH_REQUESTS_PER_MINUTE - userRequests.length);
    
    return { allowed, remaining };
  }
  
  /**
   * Record a search request for rate limiting
   * @param userId - User ID
   */
  private recordSearchRequest(userId: string): void {
    const now = Date.now();
    const userRequests = this.searchRateLimit.get(userId) || [];
    userRequests.push(now);
    this.searchRateLimit.set(userId, userRequests);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mailboxes')
  async mailboxes(@Req() req: any) {
    // return labels from Gmail for the authenticated user
    try {
      const labels = await this.gmailService.listLabels(req.user.id);
      return labels;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to fetch labels' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('mailboxes/:id/emails')
  async mailboxEmails(
    @Req() req: any, 
    @Param('id') id: string, 
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageToken') pageToken?: string
  ) {
    try {
      const pageSize = limit ? parseInt(limit, 10) : 50;
      const res = await this.gmailService.listMessagesInLabel(req.user.id, id, pageSize, pageToken as any);
      return res;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to list messages' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('mail/inbox')
  async getInbox(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('pageToken') pageToken?: string
  ) {
    try {
      const pageSize = limit ? parseInt(limit, 10) : 50;
      const res = await this.gmailService.listMessagesInLabel(req.user.id, 'INBOX', pageSize, pageToken as any);
      return res;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to fetch inbox' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('emails/:id')
  async emailDetail(@Req() req: any, @Param('id') id: string) {
    try {
      const msg = await this.gmailService.getMessage(req.user.id, id);
      return msg;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to get message' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('emails/send')
  async sendEmail(@Req() req: any, @Body() dto: SendEmailDto) {
    try {
      const result = await this.gmailService.sendEmail(req.user.id, dto);
      return { status: 200, message: 'Email sent successfully', data: result };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to send email' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('emails/:id/reply')
  async replyEmail(@Req() req: any, @Param('id') id: string, @Body() dto: ReplyEmailDto) {
    try {
      const result = await this.gmailService.replyToEmail(req.user.id, id, dto);
      return { status: 200, message: 'Reply sent successfully', data: result };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to reply to email' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('emails/:id/modify')
  async modifyEmail(@Req() req: any, @Param('id') id: string, @Body() dto: ModifyEmailDto) {
    try {
      const result = await this.gmailService.modifyMessage(req.user.id, id, dto.action);
      return { status: 200, message: 'Email modified successfully', data: result };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to modify email' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('labels/:id/toggle')
  async toggleLabel(@Req() req: any, @Param('id') labelId: string, @Body() dto: ToggleLabelDto) {
    try {
      const result = await this.gmailService.toggleLabel(req.user.id, labelId, dto.emailIds, dto.action);
      return { status: 200, message: 'Label toggled successfully', data: result };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to toggle label' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('attachments/:messageId/:attachmentId')
  async getAttachment(
    @Req() req: any, 
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response
  ) {
    try {
      const attachment = await this.gmailService.getAttachment(req.user.id, messageId, attachmentId);
      
      // Decode base64url data
      const data = Buffer.from(attachment.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      
      // Set appropriate headers
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', data.length);
      
      // Stream the data
      res.send(data);
    } catch (err) {
      res.status(500).json({ status: 500, message: err?.message || 'Failed to get attachment' });
    }
  }

  // ============================================
  // KANBAN BOARD ENDPOINTS (DB-based)
  // ============================================



  @UseGuards(JwtAuthGuard)
  @Get('kanban/columns/:status/emails')
  async getColumnEmails(
    @Req() req: any,
    @Param('status') status: string,
    @Query('limit') limit?: string,
  ) {
    try {
      // Validate status (chỉ cho phép TODO, IN_PROGRESS, DONE)
      const validStatuses = ['TODO', 'IN_PROGRESS', 'DONE'];
      if (!validStatuses.includes(status)) {
        return { status: 400, message: 'Invalid status. Use TODO, IN_PROGRESS, or DONE' };
      }

      // BƯỚC 1: Lấy emails từ MongoDB theo status (chỉ emails đã trong Kanban)
      const dbEmails = await this.emailMetadataService.getEmailsByStatus(req.user.id, status);
      
      const pageSize = limit ? parseInt(limit, 10) : 50;
      const limitedEmails = dbEmails.slice(0, pageSize);
      
      // BƯỚC 2: Fetch full data từ Gmail cho mỗi email
      const emailsWithFullData = await Promise.all(
        limitedEmails.map(async (dbEmail) => {
          try {
            const gmailData = await this.gmailService.getMessage(req.user.id, dbEmail.emailId);
            return {
              ...gmailData,
              status: dbEmail.status,           // Từ DB
              statusUpdatedAt: dbEmail.statusUpdatedAt, // Từ DB
              summary: dbEmail.summary,         // Từ DB (nếu có)
            };
          } catch (error) {
            // Fallback: use cached data from DB
            return {
              id: dbEmail.emailId,
              threadId: dbEmail.threadId,
              subject: dbEmail.subject || '(Error loading)',
              from: dbEmail.from || '',
              snippet: dbEmail.snippet || '',
              status: dbEmail.status,
              summary: dbEmail.summary,
            };
          }
        })
      );

      return { 
        status: 200, 
        data: {
          messages: emailsWithFullData,
          total: dbEmails.length
        }
      };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to get column emails' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('emails/:id/move')
  async moveEmail(
    @Req() req: any,
    @Param('id') emailId: string,
    @Body() body: { threadId: string; toStatus: string }
  ) {
    try {
      const validStatuses = ['INBOX', 'TODO', 'IN_PROGRESS', 'DONE'];
      if (!validStatuses.includes(body.toStatus)) {
        return { status: 400, message: 'Invalid status' };
      }

      let created = false;
      let message = '';

      if (body.toStatus === 'INBOX') {
        // Case: Kanban → INBOX (DELETE from database)
        await this.emailMetadataService.deleteEmail(req.user.id, emailId);
        message = 'Email removed from Kanban';
        created = false;
      } else {
        // Case: INBOX → Kanban (INSERT) hoặc Kanban → Kanban (UPDATE)
        const existing = await this.emailMetadataService.findEmail(req.user.id, emailId);
        
        if (existing) {
          // Update existing record
          await this.emailMetadataService.updateEmailStatus(
            req.user.id,
            emailId,
            body.threadId,
            body.toStatus
          );
          message = `Email moved to ${body.toStatus}`;
          created = false;
        } else {
          // Create new record (INBOX → Kanban)
          // Fetch email data để cache
          const emailData = await this.gmailService.getMessage(req.user.id, emailId);
          
          await this.emailMetadataService.createEmailMetadata({
            userId: req.user.id,
            emailId,
            threadId: body.threadId,
            status: body.toStatus,
            subject: emailData.subject,
            from: emailData.from,
            snippet: emailData.snippet,
            receivedDate: new Date(emailData.date || Date.now()),
          });
          message = `Email added to Kanban (${body.toStatus})`;
          created = true;
        }
      }

      return { 
        status: 200, 
        message,
        data: { emailId, newStatus: body.toStatus, created }
      };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to move email' };
    }
  }



  // ============================================
  // AI SUMMARIZATION ENDPOINTS
  // ============================================

  @UseGuards(JwtAuthGuard)
  @Post('emails/:id/summarize')
  async summarizeEmail(@Req() req: any, @Param('id') emailId: string, @Body() body?: { forceRegenerate?: boolean; structured?: boolean }) {
    try {
      const forceRegenerate = body?.forceRegenerate || false;
      
      // Rate limiting check
      const rateLimitCheck = this.checkRateLimit(req.user.id);
      if (!rateLimitCheck.allowed) {
        return { 
          status: 429, 
          message: `Rate limit exceeded. You can make ${this.MAX_REQUESTS_PER_MINUTE} summarize requests per minute. Please try again later.`,
          data: {
            remaining: 0,
            resetIn: 60 // seconds
          }
        };
      }
      
      // Record this request for rate limiting
      this.recordRequest(req.user.id);
      
      // BƯỚC 1: Fetch full email từ Gmail
      const email = await this.gmailService.getMessage(req.user.id, emailId);
      
      // BƯỚC 2: Check xem đã có summary trong cache chưa (skip nếu forceRegenerate)
      if (!forceRegenerate) {
        const existingSummary = await this.emailMetadataService.getSummary(req.user.id, emailId);
        if (existingSummary) {
          return { 
            status: 200, 
            data: { 
              summary: existingSummary, 
              cached: true 
            } 
          };
        }
      }

      // BƯỚC 3: Generate summary bằng AI
      const summary = await this.aiService.summarizeEmail(
        email.from || '',
        email.subject || '',
        email.textBody || email.htmlBody || email.snippet || '',
        { structured: false } // Simple summary for mail controller
      );

      // Handle fallback case (when summary is not a string)
      const summaryText = typeof summary === 'string' ? summary : 'Unable to generate summary';

      // BƯỚC 4: Save summary vào MongoDB để cache
      await this.emailMetadataService.saveSummary(
        req.user.id,
        emailId,
        email.threadId,
        summaryText,
        'gemini-1.5-flash'
      );

      const rateLimitStatus = this.checkRateLimit(req.user.id);
      
      return { 
        status: 200, 
        data: { 
          summary: summaryText, 
          cached: false,
          rateLimit: {
            remaining: rateLimitStatus.remaining,
            max: this.MAX_REQUESTS_PER_MINUTE
          }
        } 
      };

    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to summarize email' };
    }
  }

  // ============================================
  // SNOOZE ENDPOINTS
  // ============================================

  @UseGuards(JwtAuthGuard)
  @Post('emails/:id/snooze')
  async snoozeEmail(
    @Req() req: any,
    @Param('id') emailId: string,
    @Body() body: { snoozedUntil: string; threadId: string }
  ) {
    try {
      const snoozedUntil = new Date(body.snoozedUntil);
      
      if (snoozedUntil <= new Date()) {
        return { status: 400, message: 'Snooze time must be in the future' };
      }

      const result = await this.snoozeService.snoozeEmail(
        req.user.id,
        emailId,
        body.threadId,
        snoozedUntil
      );

      return { status: 200, data: result };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to snooze email' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('emails/:id/unsnooze')
  async unsnoozeEmail(@Req() req: any, @Param('id') emailId: string) {
    try {
      const result = await this.snoozeService.unsnoozeEmail(req.user.id, emailId);
      return { status: 200, data: result };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to unsnooze email' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('emails/snoozed')
  async getSnoozedEmails(@Req() req: any) {
    try {
      const snoozed = await this.snoozeService.getSnoozedEmails(req.user.id);
      return { status: 200, data: snoozed };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to get snoozed emails' };
    }
  }

  // ============================================
  // SEARCH ENDPOINTS (Fuzzy Search)
  // ============================================

  @UseGuards(JwtAuthGuard)
  @Get('search/fuzzy')
  async searchEmails(
    @Req() req: any,
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    try {
      // Check rate limit
      const { allowed, remaining } = this.checkSearchRateLimit(req.user.id);
      if (!allowed) {
        return {
          status: 429,
          message: `Too many search requests. Please try again later.`,
          remaining: 0,
        };
      }
      
      // Record this request
      this.recordSearchRequest(req.user.id);
      
      // Validate query parameter
      if (!q || q.trim().length === 0) {
        return { 
          status: 400, 
          message: 'Query parameter "q" is required and cannot be empty' 
        };
      }

      // Build search DTO
      const searchDto: SearchEmailDto = {
        q: q.trim(),
        limit: limit ? parseInt(limit, 10) : 20,
        offset: offset ? parseInt(offset, 10) : 0,
        status: status,
      };

      // Perform fuzzy search
      const result = await this.fuzzySearchService.searchEmails(req.user.id, searchDto);

      return { 
        status: 200, 
        data: result 
      };
    } catch (err) {
      return { 
        status: 500, 
        message: err?.message || 'Failed to search emails' 
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('search/suggestions')
  async getSearchSuggestions(
    @Req() req: any,
    @Query('prefix') prefix: string,
    @Query('limit') limit?: string,
  ) {
    try {
      if (!prefix || prefix.length < 2) {
        return { status: 400, message: 'Prefix must be at least 2 characters' };
      }

      const suggestions = await this.fuzzySearchService.getSearchSuggestions(
        req.user.id,
        prefix,
        limit ? parseInt(limit, 10) : 10
      );

      return { status: 200, data: suggestions };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to get suggestions' };
    }
  }

  // ============================================
  // WEEK 3: FILTERING & SORTING SUPPORT
  // ============================================

  @UseGuards(JwtAuthGuard)
  @Get('mailboxes/:id/emails/filtered')
  async getFilteredEmails(
    @Req() req: any,
    @Param('id') labelId: string,
    @Query('sortBy') sortBy?: string, // 'date-desc', 'date-asc', 'sender'
    @Query('filterUnread') filterUnread?: string, // 'true' | 'false'
    @Query('filterAttachment') filterAttachment?: string, // 'true' | 'false'
    @Query('limit') limit?: string,
    @Query('pageToken') pageToken?: string
  ) {
    try {
      const pageSize = limit ? parseInt(limit, 10) : 50;
      
      // Fetch emails from Gmail
      const result = await this.gmailService.listMessagesInLabel(
        req.user.id,
        labelId,
        pageSize,
        pageToken as any
      );

      let emails = result.messages || [];

      // Apply filters
      if (filterUnread === 'true') {
        emails = emails.filter(email => email.isUnread);
      }

      if (filterAttachment === 'true') {
        emails = emails.filter(email => email.hasAttachment);
      }

      // Apply sorting
      if (sortBy === 'date-desc') {
        emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      } else if (sortBy === 'date-asc') {
        emails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      } else if (sortBy === 'sender') {
        emails.sort((a, b) => (a.from || '').localeCompare(b.from || ''));
      }

      return {
        status: 200,
        data: {
          messages: emails,
          nextPageToken: result.nextPageToken,
          resultSizeEstimate: result.resultSizeEstimate,
        },
      };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to get filtered emails' };
    }
  }

  // ============================================
  // WEEK 4: SEMANTIC SEARCH ENDPOINTS
  // ============================================

  @UseGuards(JwtAuthGuard)
  @Post('search/semantic')
  async semanticSearch(
    @Req() req: any,
    @Body() body: { query: string; limit?: number; threshold?: number }
  ) {
    try {
      if (!body.query || body.query.trim().length === 0) {
        return { status: 400, message: 'Query is required' };
      }

      const result = await this.semanticSearchService.semanticSearch(
        req.user.id,
        body.query,
        { limit: body.limit, threshold: body.threshold }
      );

      return result;
    } catch (err) {
      return { status: 500, message: err?.message || 'Semantic search failed' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('search/index')
  async indexEmails(
    @Req() req: any,
    @Body() body: { limit?: number } = {}
  ) {
    try {
      const result = await this.semanticSearchService.indexAllEmails(
        req.user.id,
        { limit: body.limit }
      );

      return result;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to index emails' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('search/index/stats')
  async getIndexStats(@Req() req: any) {
    try {
      const stats = await this.semanticSearchService.getIndexStats(req.user.id);
      return stats;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to get index stats' };
    }
  }

  // ============================================
  // WEEK 4: KANBAN CONFIGURATION ENDPOINTS
  // ============================================

  @UseGuards(JwtAuthGuard)
  @Get('kanban/config')
  async getKanbanConfig(@Req() req: any) {
    try {
      const config = await this.kanbanConfigService.getConfig(req.user.id);
      return config;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to get Kanban config' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('kanban/columns')
  async createColumn(
    @Req() req: any,
    @Body() body: { name: string; gmailLabel?: string; color?: string }
  ) {
    try {
      if (!body.name || body.name.trim().length === 0) {
        return { status: 400, message: 'Column name is required' };
      }

      const result = await this.kanbanConfigService.createColumn(req.user.id, body);
      return result;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to create column' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('kanban/columns/:columnId')
  async updateColumn(
    @Req() req: any,
    @Param('columnId') columnId: string,
    @Body() body: { name?: string; gmailLabel?: string; color?: string; isVisible?: boolean }
  ) {
    try {
      const result = await this.kanbanConfigService.updateColumn(req.user.id, columnId, body);
      return result;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to update column' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('kanban/columns/:columnId/delete')
  async deleteColumn(
    @Req() req: any,
    @Param('columnId') columnId: string
  ) {
    try {
      const result = await this.kanbanConfigService.deleteColumn(req.user.id, columnId);
      return result;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to delete column' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('kanban/columns/reorder')
  async reorderColumns(
    @Req() req: any,
    @Body() body: { columnOrder: string[] }
  ) {
    try {
      if (!body.columnOrder || !Array.isArray(body.columnOrder)) {
        return { status: 400, message: 'columnOrder array is required' };
      }

      const result = await this.kanbanConfigService.reorderColumns(req.user.id, body.columnOrder);
      return result;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to reorder columns' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('kanban/columns/:columnId/emails')
  async getCustomColumnEmails(
    @Req() req: any,
    @Param('columnId') columnId: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('filterUnread') filterUnread?: string,
    @Query('filterAttachment') filterAttachment?: string
  ) {
    try {
      const options: any = {
        limit: limit ? parseInt(limit, 10) : 50,
      };

      if (sortBy) options.sortBy = sortBy;
      if (filterUnread === 'true') options.filterUnread = true;
      if (filterAttachment === 'true') options.filterAttachment = true;

      const result = await this.kanbanConfigService.getColumnEmails(
        req.user.id,
        columnId,
        options
      );

      return result;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to get column emails' };
    }
  }
}
