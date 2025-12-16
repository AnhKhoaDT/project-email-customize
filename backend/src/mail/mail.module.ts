import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailController } from './mail.controller';
import { GmailService } from './gmail.service';
import { SnoozeService } from './snooze.service';
import { EmailMetadataService } from './email-metadata.service';
import { FuzzySearchService } from './fuzzy-search.service';
import { SemanticSearchService } from './semantic-search.service';
import { KanbanConfigService } from './kanban-config.service';
import { EmailMetadata, EmailMetadataSchema } from './schemas/email-metadata.schema';
import { KanbanConfig, KanbanConfigSchema } from './schemas/kanban-config.schema';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    AuthModule,
    AiModule,
    MongooseModule.forFeature([
      { name: EmailMetadata.name, schema: EmailMetadataSchema },
      { name: KanbanConfig.name, schema: KanbanConfigSchema },
    ]),
  ],
  controllers: [MailController],
  providers: [
    GmailService,
    SnoozeService,
    EmailMetadataService,
    FuzzySearchService,
    SemanticSearchService,
    KanbanConfigService,
  ],
  exports: [
    GmailService, 
    AiService, 
    SnoozeService, 
    EmailMetadataService,
    FuzzySearchService,
    SemanticSearchService,
    KanbanConfigService,
  ],
})
export class MailModule {}
