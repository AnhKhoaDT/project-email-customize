import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailController } from './mail.controller';
import { GmailService } from './gmail.service';
import { SnoozeService } from './snooze.service';
import { EmailMetadataService } from './email-metadata.service';
import { EmailMetadata, EmailMetadataSchema } from './schemas/email-metadata.schema';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    AuthModule,
    AiModule,
    MongooseModule.forFeature([
      { name: EmailMetadata.name, schema: EmailMetadataSchema }
    ]),
  ],
  controllers: [MailController],
  providers: [
    GmailService,
    SnoozeService,
    EmailMetadataService,
  ],
  exports: [GmailService, SnoozeService, EmailMetadataService],
})
export class MailModule {}
