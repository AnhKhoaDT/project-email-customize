import { Controller, Get, Post, Body, Param, Query, Req, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GmailService } from './gmail.service';
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
  constructor(private gmailService: GmailService) {}

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
}
