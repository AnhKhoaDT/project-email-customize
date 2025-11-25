import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GmailService } from './gmail.service';
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
  async mailboxEmails(@Req() req: any, @Param('id') id: string, @Query('pageToken') pageToken?: string) {
    try {
      const res = await this.gmailService.listMessagesInLabel(req.user.id, id, 20, pageToken as any);
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
}
