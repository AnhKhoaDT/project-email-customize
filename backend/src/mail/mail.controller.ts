import { Controller, Get, Param, Query, Req } from '@nestjs/common';
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

  @Get('mailboxes')
  mailboxes(@Req() req: any) {
    if (!authGuard(req)) return { status: 401, message: 'Unauthorized' };
    return readJSON(path.join(this.dataDir, 'mailboxes.json'));
  }

  @Get('mailboxes/:id/emails')
  mailboxEmails(@Req() req: any, @Param('id') id: string, @Query('page') page = '1') {
    if (!authGuard(req)) return { status: 401, message: 'Unauthorized' };
    // For demo we map 'inbox' id to inbox-emails.json
    const file = id === 'inbox' ? 'inbox-emails.json' : 'inbox-emails.json';
    const all = readJSON(path.join(this.dataDir, file));
    const p = parseInt(page as string, 10) || 1;
    const pageSize = 20;
    const start = (p - 1) * pageSize;
    return { page: p, pageSize, total: all.length, items: all.slice(start, start + pageSize) };
  }

  @Get('emails/:id')
  emailDetail(@Req() req: any, @Param('id') id: string) {
    if (!authGuard(req)) return { status: 401, message: 'Unauthorized' };
    const all = readJSON(path.join(this.dataDir, 'emails.json'));
    const found = all.find((e: any) => e.id === id);
    if (!found) return { status: 404, message: 'Not found' };
    return found;
  }
}
