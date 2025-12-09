import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailController } from './mail.controller';
import { GmailService } from './gmail.service';
import { AiService } from './ai.service';
import { SnoozeService } from './snooze.service';
import { EmailMetadataService } from './email-metadata.service';
import { EmailMetadata, EmailMetadataSchema } from './schemas/email-metadata.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: EmailMetadata.name, schema: EmailMetadataSchema }
    ]),
  ],
  controllers: [MailController],
  providers: [
    GmailService,
    AiService,
    SnoozeService,
    EmailMetadataService,
  ],
  exports: [GmailService, AiService, SnoozeService, EmailMetadataService],
})
export class MailModule {}
