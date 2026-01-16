import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MailController } from './mail.controller';
import { GmailService } from './gmail.service';
import { GmailSyncService } from './gmail-sync.service';
import { SnoozeService } from './snooze.service';
import { EmailMetadataService } from './email-metadata.service';
import { FuzzySearchService } from './fuzzy-search.service';
import { SemanticSearchService } from './semantic-search.service';
import { SearchSuggestionsService } from './search-suggestions.service';
import { KanbanConfigService } from './kanban-config.service';
import { GmailSyncListener } from './gmail-sync.listener';
import { AutoIndexingService } from './auto-indexing.service';
import { GmailHistorySyncService } from './gmail-history-sync.service';
import { HybridSearchService } from './hybrid-search.service';
import { EmailMetadata, EmailMetadataSchema } from './schemas/email-metadata.schema';
import { KanbanConfig, KanbanConfigSchema } from './schemas/kanban-config.schema';
import { SearchSuggestionCache, SearchSuggestionCacheSchema } from './schemas/search-suggestion-cache.schema';
import { GmailSyncState, GmailSyncStateSchema } from './schemas/gmail-sync-state.schema';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    forwardRef(() => AuthModule), // Use forwardRef to avoid circular dependency
    AiModule,
    EventEmitterModule.forRoot(), // Enable EventEmitter2 for async events
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: EmailMetadata.name, schema: EmailMetadataSchema },
      { name: KanbanConfig.name, schema: KanbanConfigSchema },
      { name: SearchSuggestionCache.name, schema: SearchSuggestionCacheSchema },
      { name: GmailSyncState.name, schema: GmailSyncStateSchema },
    ]),
  ],
  controllers: [MailController],
  providers: [
    GmailService,
    GmailSyncService,
    SnoozeService,
    EmailMetadataService,
    FuzzySearchService,
    SemanticSearchService,
    SearchSuggestionsService,
    KanbanConfigService,
    GmailSyncListener, // 🔥 NEW: Event listener for Gmail sync
    AutoIndexingService, // 🔥 NEW: Auto-indexing background service
    GmailHistorySyncService, // 🔥 NEW: Gmail History API sync service
    HybridSearchService, // 🔥 NEW: Hybrid search with autocomplete
  ],
  exports: [
    GmailService, 
    GmailSyncService,
    SnoozeService, 
    EmailMetadataService,
    FuzzySearchService,
    SemanticSearchService,
    SearchSuggestionsService,
    KanbanConfigService,
    AutoIndexingService,
    GmailHistorySyncService,
  ],
})
export class MailModule {}
