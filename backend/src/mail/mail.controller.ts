import { Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GmailService } from './gmail.service';
import { GmailSyncService, SyncResult } from './gmail-sync.service';
import { GmailHistorySyncService } from './gmail-history-sync.service';
import { AiService } from '../ai/ai.service';
import { SnoozeService } from './snooze.service';
import { EmailMetadataService } from './email-metadata.service';
import { FuzzySearchService } from './fuzzy-search.service';
import { SemanticSearchService } from './semantic-search.service';
import { SearchSuggestionsService } from './search-suggestions.service';
import { KanbanConfigService } from './kanban-config.service';
import { HybridSearchService } from './hybrid-search.service';
import { SendEmailDto } from './dto/send-email.dto';
import { ReplyEmailDto } from './dto/reply-email.dto';
import { ModifyEmailDto } from './dto/modify-email.dto';
import { ToggleLabelDto } from './dto/toggle-label.dto';
import { SearchEmailDto } from './dto/search-email.dto';
import { MoveEmailDto } from './dto/move-email.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
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
  private readonly logger = new Logger('MailController');
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
    private gmailSyncService: GmailSyncService,
    private gmailHistorySyncService: GmailHistorySyncService,
    private aiService: AiService,
    private snoozeService: SnoozeService,
    private emailMetadataService: EmailMetadataService,
    private fuzzySearchService: FuzzySearchService,
    private semanticSearchService: SemanticSearchService,
    private searchSuggestionsService: SearchSuggestionsService,
    private kanbanConfigService: KanbanConfigService,
    private hybridSearchService: HybridSearchService,
  ) { }

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
  @Get('mailboxes/:id/kanban-emails')
  async getKanbanEmails(
    @Req() req: any,
    @Param('id') mailboxId: string,
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

      const result = await this.kanbanConfigService.getKanbanEmails(
        req.user.id,
        mailboxId,
        options
      );

      return result;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to get kanban emails' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('mailboxes/all/emails')
  async getAllEmails(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('pageToken') pageToken?: string
  ) {
    try {
      const pageSize = limit ? parseInt(limit, 10) : 300;

      // Try Gmail API first
      try {
        const res = await this.gmailService.listAllEmails(req.user.id, pageSize, pageToken as any);
        return res;
      } catch (gmailError) {
        // Fallback to MongoDB seed data if Gmail fails (no token, etc.)
        this.logger.warn(`Gmail API failed for user ${req.user.id}, falling back to MongoDB seed data`);

        // Get emails from MongoDB (exclude system labels)
        const dbEmails = await this.emailMetadataService.getAllEmails(req.user.id, pageSize);

        // Format to match Gmail API response
        return {
          messages: dbEmails.map(email => ({
            id: email.emailId,
            threadId: email.emailId, // Use emailId as fallback
            labelIds: email.labelIds,
            snippet: email.snippet || '',
            subject: email.subject || 'No subject',
            from: email.from || 'Unknown',
            date: email.receivedDate?.toISOString() || new Date().toISOString(),
            isUnread: !email.labelIds?.includes('READ'),
            isStarred: email.labelIds?.includes('STARRED') || false,
            isImportant: email.labelIds?.includes('IMPORTANT') || false,
            hasAttachment: false,
          })),
          resultSizeEstimate: dbEmails.length,
          nextPageToken: null,
        };
      }
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to list all emails' };
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

      // Try Gmail API first
      try {
        // Special handling for ARCHIVE: Gmail doesn't have ARCHIVE label
        // Archived emails are those without INBOX label
        if (id === 'ARCHIVE') {
          const res = await this.gmailService.listArchivedMessages(req.user.id, pageSize, pageToken as any);
          return res;
        }
        
        const res = await this.gmailService.listMessagesInLabel(req.user.id, id, pageSize, pageToken as any);
        return res;
      } catch (gmailError) {
        // Fallback to MongoDB seed data if Gmail fails (no token, etc.)
        this.logger.warn(`Gmail API failed for user ${req.user.id}, falling back to MongoDB seed data`);

        // Get emails from MongoDB by label
        const dbEmails = await this.emailMetadataService.getEmailsByLabel(req.user.id, id, pageSize);

        // Format to match Gmail API response
        return {
          messages: dbEmails.map(email => ({
            id: email.emailId,
            threadId: email.emailId, // Use emailId as fallback
            labelIds: email.labelIds,
            snippet: email.snippet || '',
            subject: email.subject || 'No subject',
            from: email.from || 'Unknown',
            date: email.receivedDate?.toISOString() || new Date().toISOString(),
            isUnread: !email.labelIds?.includes('READ'),
            hasAttachment: false,
          })),
          resultSizeEstimate: dbEmails.length,
          nextPageToken: null,
        };
      }
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



  // ============================================
  // DEPRECATED ENDPOINT - DO NOT USE
  // Use getCustomColumnEmails instead (line ~780)
  // ============================================
  // @UseGuards(JwtAuthGuard)
  // @Get('kanban/columns/:status/emails')
  // async getColumnEmails(
  //   @Req() req: any,
  //   @Param('status') status: string,
  //   @Query('limit') limit?: string,
  // ) {
  //   try {
  //     // Validate status (chỉ cho phép TODO, IN_PROGRESS, DONE)
  //     const validStatuses = ['TODO', 'IN_PROGRESS', 'DONE'];
  //     if (!validStatuses.includes(status)) {
  //       return { status: 400, message: 'Invalid status. Use TODO, IN_PROGRESS, or DONE' };
  //     }
  //
  //     // BƯỚC 1: Lấy emails từ MongoDB theo status (chỉ emails đã trong Kanban)
  //     const dbEmails = await this.emailMetadataService.getEmailsByStatus(req.user.id, status);
  //     
  //     const pageSize = limit ? parseInt(limit, 10) : 50;
  //     const limitedEmails = dbEmails.slice(0, pageSize);
  //     
  //     // BƯỚC 2: Fetch full data từ Gmail cho mỗi email
  //     const emailsWithFullData = await Promise.all(
  //       limitedEmails.map(async (dbEmail) => {
  //         try {
  //           const gmailData = await this.gmailService.getMessage(req.user.id, dbEmail.emailId);
  //           return {
  //             ...gmailData,
  //             cachedColumnId: dbEmail.cachedColumnId,           // Từ DB
  //             cachedColumnName: dbEmail.cachedColumnName,       // Từ DB
  //             labelIds: dbEmail.labelIds,                       // Từ DB
  //             kanbanUpdatedAt: dbEmail.kanbanUpdatedAt,        // Từ DB
  //             summary: dbEmail.summary,                        // Từ DB (nếu có)
  //           };
  //         } catch (error) {
  //           // Fallback: use cached data from DB
  //           return {
  //             id: dbEmail.emailId,
  //             threadId: dbEmail.threadId,
  //             subject: dbEmail.subject || '(Error loading)',
  //             from: dbEmail.from || '',
  //             snippet: dbEmail.snippet || '',
  //             cachedColumnId: dbEmail.cachedColumnId,
  //             cachedColumnName: dbEmail.cachedColumnName,
  //             labelIds: dbEmail.labelIds,
  //             summary: dbEmail.summary,
  //           };
  //         }
  //       })
  //     );
  //
  //     return { 
  //       status: 200, 
  //       data: {
  //         messages: emailsWithFullData,
  //         total: dbEmails.length
  //       }
  //     };
  //   } catch (err) {
  //     return { status: 500, message: err?.message || 'Failed to get column emails' };
  //   }
  // }

  // ⚠️ DEPRECATED: Old moveEmail endpoint removed
  // Use POST /api/kanban/move instead (Dynamic Kanban - Week 4)
  // See line ~858 for new implementation



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
    @Body() body: { snoozedUntil: string }
  ) {
    try {
      const snoozedUntil = new Date(body.snoozedUntil);

      if (snoozedUntil <= new Date()) {
        return { status: 400, message: 'Snooze time must be in the future' };
      }

      const result = await this.snoozeService.snoozeEmail(
        req.user.id,
        emailId,
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

      const suggestions = await this.searchSuggestionsService.getSearchSuggestions(
        req.user.id,
        prefix,
        limit ? parseInt(limit, 10) : 10
      );

      return { status: 200, data: suggestions };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to get suggestions' };
    }
  }

  /**
   * 🔥 NEW: Hybrid Search Suggestions
   * 
   * Combines:
   * - Top Hits: Direct email matches (navigate to email)
   * - Keywords: Topic suggestions (trigger semantic search)
   * 
   * Example:
   * GET /search/hybrid-suggestions?prefix=meeting&limitTopHits=2&limitKeywords=4
   * 
   * Response:
   * {
   *   topHits: [{ type: 'email', emailId: 'abc', from: '...', subject: '...' }],
   *   keywords: [{ type: 'keyword', value: 'Meeting schedule', emailCount: 12 }],
   *   totalResults: 6,
   *   processingTimeMs: 45
   * }
   */
  @UseGuards(JwtAuthGuard)
  @Get('search/hybrid-suggestions')
  async getHybridSuggestions(
    @Req() req: any,
    @Query('prefix') prefix: string,
    @Query('limitTopHits') limitTopHits?: string,
    @Query('limitKeywords') limitKeywords?: string,
  ) {
    try {
      if (!prefix || prefix.trim().length < 2) {
        return { 
          status: 400, 
          message: 'Prefix must be at least 2 characters' 
        };
      }

      // Convert string params to numbers
      const topHitsLimit = limitTopHits ? parseInt(limitTopHits, 10) : 2;
      const keywordsLimit = limitKeywords ? parseInt(limitKeywords, 10) : 4;

      const result = await this.hybridSearchService.getHybridSuggestions(
        req.user.id,
        prefix,
        topHitsLimit,
        keywordsLimit,
      );

      return { 
        status: 200, 
        data: result 
      };
    } catch (err) {
      return { 
        status: 500, 
        message: err?.message || 'Failed to get hybrid suggestions' 
      };
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

  // ============================================
  // DEPRECATED: Manual indexing endpoints
  // Auto-indexing is now enabled by default
  // These endpoints kept for admin/debugging purposes only
  // ============================================

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
    @Body() body: { name: string; gmailLabel?: string; color?: string; createNewLabel?: boolean }
  ) {
    try {
      if (!body.name || body.name.trim().length === 0) {
        return { status: 400, message: 'Column name is required' };
      }

      const result = await this.kanbanConfigService.createColumn(req.user.id, body);
      return result;
    } catch (err) {
      // Validation errors (duplicate label/name) should return 400
      const isValidationError = err?.message?.includes('already mapped') ||
        err?.message?.includes('already exists');

      return {
        status: isValidationError ? 400 : 500,
        message: err?.message || 'Failed to create column'
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Put('kanban/columns/:columnId')
  async updateColumn(
    @Req() req: any,
    @Param('columnId') columnId: string,
    @Body() body: UpdateColumnDto
  ) {
    try {
      const result = await this.kanbanConfigService.updateColumn(req.user.id, columnId, body);
      return result;
    } catch (err) {
      // Validation errors (duplicate label/name) should return 400
      const isValidationError = err?.message?.includes('already mapped') ||
        err?.message?.includes('already exists') ||
        err?.message?.includes('not found');

      return {
        status: isValidationError ? 400 : 500,
        message: err?.message || 'Failed to update column'
      };
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

  /**
   * Reorder Kanban columns
   * POST /api/kanban/columns/reorder
   * Body: { columnOrder: string[] }
   */
  @UseGuards(JwtAuthGuard)
  @Post('kanban/columns/reorder')
  async reorderColumns(
    @Req() req: any,
    @Body() body: { columnOrder: string[] }
  ) {
    try {
      const result = await this.kanbanConfigService.reorderColumns(req.user.id, body.columnOrder || []);
      return result;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to reorder columns' };
    }
  }

  // ============================================
  // ADMIN/DEBUG ENDPOINTS - Duplicate Label Management
  // ============================================

  @UseGuards(JwtAuthGuard)
  @Get('gmail/labels')
  async getGmailLabels(@Req() req: any) {
    try {
      const labels = await this.gmailService.getSafeLabelsForKanban(req.user.id);
      return {
        status: 200,
        data: labels,
        message: 'Safe labels retrieved successfully'
      };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to get Gmail labels' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('kanban/validate-labels')
  async validateLabels(@Req() req: any) {
    try {
      const result = await this.kanbanConfigService.validateNoDuplicateLabels(req.user.id);
      return {
        status: 200,
        data: result,
        message: result.isValid ? 'No duplicate labels found' : 'Duplicate labels detected'
      };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to validate labels' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('kanban/fix-duplicate-labels')
  async fixDuplicateLabels(@Req() req: any) {
    try {
      const result = await this.kanbanConfigService.fixDuplicateLabels(req.user.id);
      return {
        status: 200,
        data: result,
        message: result.fixed > 0
          ? `Fixed ${result.fixed} duplicate label(s)`
          : 'No duplicates found'
      };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to fix duplicate labels' };
    }
  }

  // ============================================
  // KANBAN EMAIL RETRIEVAL
  // ============================================

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

  // ============================================
  // 🔥 REFINEMENT: MOVE EMAIL ENDPOINT
  // ============================================
  /**
   * Move email between Kanban columns with Gmail label sync
   * 
   * WEEK 4 - Dynamic Kanban Configuration
   * 
   * Flow:
   * 1. Update EmailMetadata (labelIds + cachedColumnId)
   * 2. Emit event for async Gmail API sync
   * 3. Return immediately (Optimistic UI)
   * 
   * POST /api/kanban/move
   * Body: { emailId, fromColumnId, toColumnId, optimistic? }
   */
  @UseGuards(JwtAuthGuard)
  @Post('kanban/move')
  async moveEmail(
    @Req() req: any,
    @Body() dto: MoveEmailDto
  ) {
    try {
      const result = await this.kanbanConfigService.moveEmail(req.user.id, dto);
      return result;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to move email' };
    }
  }

  // ============================================
  // LABEL ERROR RECOVERY ENDPOINTS
  // ============================================

  /**
   * Remap column to a different Gmail label
   * Used when original label is deleted
   * 
   * PUT /api/kanban/columns/:columnId/remap-label
   * Body: { newGmailLabel, createNewLabel? }
   */
  @UseGuards(JwtAuthGuard)
  @Post('kanban/columns/:columnId/remap-label')
  async remapColumnLabel(
    @Req() req: any,
    @Param('columnId') columnId: string,
    @Body() body: { newGmailLabel?: string; createNewLabel?: boolean; labelName?: string; color?: string }
  ) {
    try {
      const result = await this.kanbanConfigService.remapColumnLabel(
        req.user.id,
        columnId,
        body.newGmailLabel,
        body.createNewLabel,
        body.labelName,
        body.color
      );
      return result;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to remap label' };
    }
  }

  /**
   * Clear label error state (for manual recovery)
   * 
   * POST /api/kanban/columns/:columnId/clear-error
   */
  @UseGuards(JwtAuthGuard)
  @Post('kanban/columns/:columnId/clear-error')
  async clearColumnError(
    @Req() req: any,
    @Param('columnId') columnId: string
  ) {
    try {
      const result = await this.kanbanConfigService.clearColumnError(req.user.id, columnId);
      return result;
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to clear error' };
    }
  }

  // ============================================
  // GMAIL SYNC ENDPOINTS
  // ============================================

  /**
   * Sync emails from Gmail to database
   * 
   * POST /api/sync/gmail
   * Body: { label?: string, limit?: number, forceResync?: boolean }
   */
  @UseGuards(JwtAuthGuard)
  @Post('sync/gmail')
  async syncGmail(
    @Req() req: any,
    @Body() body: { label?: string; limit?: number; forceResync?: boolean }
  ) {
    try {
      const result = await this.gmailSyncService.syncEmails({
        userId: req.user.id,
        limit: body.limit || 100,
        forceResync: body.forceResync || false,
      });

      return {
        status: 200,
        message: 'Gmail sync completed',
        data: result,
      };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to sync Gmail' };
    }
  }

  /**
   * Sync all emails for a user
   * 
   * POST /api/sync/all
   * Body: { limit?: number }
   */
  @UseGuards(JwtAuthGuard)
  @Post('sync/all')
  async syncAllLabels(
    @Req() req: any,
    @Body() body: { limit?: number }
  ) {
    try {
      const result = await this.gmailSyncService.syncAllLabels(
        req.user.id,
        body.limit || 150
      );

      return {
        status: 200,
        message: 'Full sync completed',
        data: result,
      };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to sync all emails' };
    }
  }

  /**
   * Trigger auto-sync for current user
   * 
   * POST /api/sync/trigger
   */
  @UseGuards(JwtAuthGuard)
  @Post('sync/trigger')
  async triggerSync(@Req() req: any) {
    try {
      // Trigger sync in background
      const userId = req.user.id;
      this.gmailSyncService.syncAllLabels(userId, 100).catch(err => {
        console.error(`[Mail] Manual sync failed for user ${userId}:`, err.message);
      });

      return {
        status: 200,
        message: 'Sync triggered successfully. Check /api/sync/stats for progress.',
      };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to trigger sync' };
    }
  }

  /**
   * Trigger history sync for current user
   * 
   * POST /api/sync/history
   */
  @UseGuards(JwtAuthGuard)
  @Post('sync/history')
  async triggerHistorySync(@Req() req: any) {
    try {
      // Trigger history sync in background
      const userId = req.user.id;
      this.gmailHistorySyncService.triggerHistorySync(userId).catch(err => {
        console.error(`[Mail] History sync failed for user ${userId}:`, err.message);
      });

      return {
        status: 200,
        message: 'History sync triggered successfully. Check /api/sync/stats for progress.',
      };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to trigger history sync' };
    }
  }

  /**
   * Get sync statistics
   * 
   * GET /api/sync/stats
   */
  @UseGuards(JwtAuthGuard)
  @Get('sync/stats')
  async getSyncStats(@Req() req: any) {
    try {
      const stats = await this.gmailSyncService.getSyncStats(req.user.id);

      return {
        status: 200,
        data: stats,
      };
    } catch (err) {
      return { status: 500, message: err?.message || 'Failed to get sync stats' };
    }
  }
}
