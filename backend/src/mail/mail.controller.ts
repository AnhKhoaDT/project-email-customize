import { Controller, Get, Post, Body, Param, Query, Req, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GmailService } from './gmail.service';
import { AiService } from '../ai/ai.service';
import { SnoozeService } from './snooze.service';
import { EmailMetadataService } from './email-metadata.service';
import { SendEmailDto } from './dto/send-email.dto';
import { ReplyEmailDto } from './dto/reply-email.dto';
import { ModifyEmailDto } from './dto/modify-email.dto';
import { ToggleLabelDto } from './dto/toggle-label.dto';
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
  constructor(
    private gmailService: GmailService,
    private aiService: AiService,
    private snoozeService: SnoozeService,
    private emailMetadataService: EmailMetadataService,
  ) {}

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
  async summarizeEmail(@Req() req: any, @Param('id') emailId: string) {
    try {
      // BƯỚC 1: Fetch full email từ Gmail
      const email = await this.gmailService.getMessage(req.user.id, emailId);
      
      // BƯỚC 2: Check xem đã có summary trong cache chưa
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

      return { 
        status: 200, 
        data: { 
          summary: summaryText, 
          cached: false 
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
}
