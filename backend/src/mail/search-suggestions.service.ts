import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SearchSuggestionCache, SearchSuggestionCacheDocument } from './schemas/search-suggestion-cache.schema';
import { GmailService } from './gmail.service';

/**
 * Search Suggestions Service - Autocomplete for email search
 * 
 * Features:
 * - MongoDB caching with TTL (1 hour)
 * - Fetch from Gmail API on cache miss
 * - Support for both sender and subject suggestions
 * - Prefix-based matching (case-insensitive)
 * - Response time: ~5-10ms (cache hit), ~100-200ms (cache miss)
 * 
 * Architecture:
 * - Separated from search services (fuzzy/semantic) for better modularity
 * - Can be reused across multiple search modes
 * - Single responsibility: provide autocomplete suggestions
 */
@Injectable()
export class SearchSuggestionsService {
  constructor(
    @InjectModel(SearchSuggestionCache.name)
    private suggestionCacheModel: Model<SearchSuggestionCacheDocument>,
    private gmailService: GmailService,
  ) {}

  /**
   * Get search suggestions with MongoDB caching (Hybrid approach)
   * 
   * Strategy:
   * 1. Check MongoDB cache first (TTL: 1 hour)
   * 2. If cache hit → return immediately
   * 3. If cache miss → query Gmail API, cache result, then return
   * 
   * Benefits:
   * - Fast response (cache hit: ~5-10ms, cache miss: ~100-200ms)
   * - Automatic cleanup via TTL index
   * - Persistent across server restarts
   * - Reduced Gmail API calls
   * 
   * @param userId - User ID
   * @param prefix - Search prefix (minimum 2 characters)
   * @param limit - Maximum number of suggestions (default: 10)
   * @returns Array of suggestion objects with value and type
   */
  async getSearchSuggestions(
    userId: string, 
    prefix: string, 
    limit: number = 10
  ): Promise<Array<{ value: string; type: 'sender' | 'subject' }>> {
    if (!prefix || prefix.length < 2) {
      return [];
    }

    const normalizedPrefix = prefix.toLowerCase().trim();

    try {
      // ============================================
      // STEP 1: Check MongoDB cache
      // ============================================
      const cachedResult = await this.suggestionCacheModel.findOne({
        userId,
        prefix: normalizedPrefix,
      }).exec();

      if (cachedResult) {
        console.log(`[Cache HIT] Suggestions for "${prefix}"`);
        // Convert cached strings to typed suggestions
        const suggestions = this.parseStoredSuggestions(cachedResult.suggestions);
        return suggestions.slice(0, limit);
      }

      console.log(`[Cache MISS] Fetching suggestions for "${prefix}"`);

      // ============================================
      // STEP 2: Cache miss → Fetch from Gmail API
      // ============================================
      const suggestions = await this.fetchSuggestionsFromGmail(userId, normalizedPrefix, limit);

      // ============================================
      // STEP 3: Store in cache for future requests
      // ============================================
      if (suggestions.length > 0) {
        await this.cacheSuggestions(userId, normalizedPrefix, suggestions);
      }

      return suggestions;

    } catch (error) {
      console.error('[Suggestions] Error:', error);
      // Fallback: return empty array on error
      return [];
    }
  }

  /**
   * Fetch suggestions from Gmail API
   * Queries both senders and subjects from recent emails
   */
  private async fetchSuggestionsFromGmail(
    userId: string,
    prefix: string,
    limit: number
  ): Promise<Array<{ value: string; type: 'sender' | 'subject' }>> {
    try {
      // Fetch recent emails from Gmail API
      const inboxData = await this.gmailService.listMessagesInLabel(userId, 'INBOX', 200);
      
      if (!inboxData?.messages || inboxData.messages.length === 0) {
        console.log('[Suggestions] No emails found in inbox');
        return [];
      }

      const emails = inboxData.messages;
      const lowerPrefix = prefix.toLowerCase();

      // Extract unique senders that match prefix
      const sendersSet = new Set<string>();
      emails.forEach(email => {
        if (email.from && email.from.toLowerCase().includes(lowerPrefix)) {
          // Normalize sender: extract email address if in format "Name <email@domain.com>"
          let normalizedSender = email.from;
          const emailMatch = email.from.match(/<(.+?)>/);
          if (emailMatch) {
            // Has format "Name <email>" -> use email only for better search
            normalizedSender = emailMatch[1];
          }
          sendersSet.add(normalizedSender);
        }
      });

      // Extract unique subjects that match prefix
      // Clean subjects for better semantic search
      const subjectsSet = new Set<string>();
      emails.forEach(email => {
        if (email.subject && email.subject.toLowerCase().includes(lowerPrefix)) {
          // Clean up subject: remove "Re:", "Fwd:" prefixes
          let cleanSubject = email.subject
            .replace(/^(Re|RE|Fwd|FWD|Fw|FW):\s*/gi, '')
            .trim();
          
          if (cleanSubject.length >= 3) { // Minimum length for meaningful search
            subjectsSet.add(cleanSubject);
          }
        }
      });

      console.log(`[Suggestions] Found ${sendersSet.size} senders, ${subjectsSet.size} subjects for "${prefix}"`);

      // Combine suggestions
      const suggestions: Array<{ value: string; type: 'sender' | 'subject' }> = [];
      
      // Prioritize subjects for semantic search (more meaningful than sender emails)
      const subjectsArray = Array.from(subjectsSet).slice(0, Math.ceil(limit / 2));
      subjectsArray.forEach(subject => {
        if (suggestions.length < limit) {
          suggestions.push({ value: subject, type: 'subject' });
        }
      });
      
      // Add senders if we still have room
      const sendersArray = Array.from(sendersSet).slice(0, limit);
      sendersArray.forEach(sender => {
        if (suggestions.length < limit) {
          suggestions.push({ value: sender, type: 'sender' });
        }
      });

      return suggestions.slice(0, limit);
    } catch (error) {
      console.error('[Suggestions] Error fetching from Gmail:', error);
      return [];
    }
  }

  /**
   * Cache suggestions in MongoDB
   * Uses upsert to update existing cache or create new one
   */
  private async cacheSuggestions(
    userId: string,
    prefix: string,
    suggestions: Array<{ value: string; type: 'sender' | 'subject' }>
  ): Promise<void> {
    try {
      // Store suggestions as formatted strings (e.g., "sender:john@example.com")
      const storedSuggestions = suggestions.map(s => `${s.type}:${s.value}`);

      await this.suggestionCacheModel.findOneAndUpdate(
        { userId, prefix },
        { 
          userId, 
          prefix, 
          suggestions: storedSuggestions,
          type: 'both',
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      ).exec();

      console.log(`[Cache STORE] Cached ${suggestions.length} suggestions for "${prefix}"`);
    } catch (error) {
      console.error('[Cache STORE] Error:', error);
      // Don't throw - caching failure shouldn't break the request
    }
  }

  /**
   * Parse stored suggestions from "type:value" format
   */
  private parseStoredSuggestions(
    stored: string[]
  ): Array<{ value: string; type: 'sender' | 'subject' }> {
    return stored.map(str => {
      const [type, ...valueParts] = str.split(':');
      return {
        value: valueParts.join(':'), // Rejoin in case value contains ':'
        type: (type === 'sender' || type === 'subject') ? type : 'subject',
      };
    });
  }

  /**
   * Invalidate cache for a user (optional - for manual cache clear)
   */
  async invalidateSuggestionsCache(userId: string): Promise<void> {
    await this.suggestionCacheModel.deleteMany({ userId }).exec();
    console.log(`[Cache INVALIDATE] Cleared all suggestions cache for user ${userId}`);
  }

  /**
   * Invalidate specific prefix cache (optional - for targeted cache clear)
   */
  async invalidatePrefixCache(userId: string, prefix: string): Promise<void> {
    await this.suggestionCacheModel.deleteOne({ 
      userId, 
      prefix: prefix.toLowerCase().trim() 
    }).exec();
    console.log(`[Cache INVALIDATE] Cleared cache for prefix "${prefix}"`);
  }
}
