import { Module } from '@nestjs/common';
import { MailController } from './mail.controller';
import { GmailService } from './gmail.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MailController],
  providers: [GmailService],
})
export class MailModule {}
