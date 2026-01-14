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

      // Extract unique keywords from subjects (not full subjects)
      // Strategy: Extract meaningful keywords/topics instead of full subject lines
      const keywordsSet = new Set<string>();
      emails.forEach(email => {
        if (email.subject && email.subject.toLowerCase().includes(lowerPrefix)) {
          // Clean up subject: remove "Re:", "Fwd:" prefixes
          let cleanSubject = email.subject
            .replace(/^(Re|RE|Fwd|FWD|Fw|FW):\s*/gi, '')
            .trim();
          
          // Extract keywords from subject
          const extractedKeywords = this.extractKeywordsFromSubject(cleanSubject, lowerPrefix);
          extractedKeywords.forEach(keyword => keywordsSet.add(keyword));
        }
      });

      console.log(`[Suggestions] Found ${sendersSet.size} senders, ${keywordsSet.size} keywords for "${prefix}"`);

      // Combine suggestions - PRIORITIZE Keywords (Track B requirement: at least 3 keywords)
      const suggestions: Array<{ value: string; type: 'sender' | 'subject' }> = [];
      
      const sendersArray = Array.from(sendersSet);
      const keywordsArray = Array.from(keywordsSet);
      
      // STRATEGY: Show at least 3 keywords (topics), then fill remaining with contacts
      const MIN_KEYWORDS = 3;
      const MAX_CONTACTS = 2; // Leave room for keywords
      
      // Step 1: Add keywords first (for semantic search - Track B requirement)
      const keywordCount = Math.min(keywordsArray.length, Math.max(MIN_KEYWORDS, limit - MAX_CONTACTS));
      for (let i = 0; i < keywordCount && i < keywordsArray.length; i++) {
        suggestions.push({ 
          value: keywordsArray[i], 
          type: 'subject' 
        });
      }
      
      // Step 2: Fill remaining slots with contacts (exact filtering)
      const remainingSlots = limit - suggestions.length;
      const contactCount = Math.min(sendersArray.length, remainingSlots);
      for (let i = 0; i < contactCount; i++) {
        suggestions.push({ 
          value: sendersArray[i], 
          type: 'sender' 
        });
      }

      console.log(`[Suggestions] Returning ${suggestions.length} suggestions (${suggestions.filter(s => s.type === 'sender').length} contacts, ${suggestions.filter(s => s.type === 'subject').length} keywords)`);
      
      return suggestions;
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
   * Extract keywords/topics from subject line
   * 
   * Strategy:
   * 1. Extract important noun phrases (capitalized words, acronyms)
   * 2. Extract phrases containing the search prefix
   * 3. Limit to 2-5 words per keyword for readability
   * 
   * Examples:
   * - "Modernize your APIs with AI-powered tools" → ["APIs", "AI-powered tools", "Modernize"]
   * - "SOC L1 is getting a new member" → ["SOC L1", "new member"]
   * - "Meeting schedule for next week" → ["Meeting schedule", "next week"]
   */
  private extractKeywordsFromSubject(subject: string, prefix: string): string[] {
    const keywords: string[] = [];
    
    // Strategy 1: Extract acronyms and capitalized words (technical terms, names)
    const acronyms = subject.match(/\b[A-Z]{2,}\b/g); // SOC, API, AWS, etc.
    if (acronyms) {
      acronyms.forEach(acronym => {
        if (acronym.toLowerCase().includes(prefix)) {
          keywords.push(acronym);
        }
      });
    }
    
    // Strategy 2: Extract phrases with capitalized words (2-3 words)
    const capitalizedPhrases = subject.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}/g);
    if (capitalizedPhrases) {
      capitalizedPhrases.forEach(phrase => {
        if (phrase.toLowerCase().includes(prefix) && phrase.length >= 3) {
          keywords.push(phrase.trim());
        }
      });
    }
    
    // Strategy 3: Extract n-grams (2-4 words) containing the prefix
    const words = subject.split(/\s+/);
    for (let len = 2; len <= Math.min(4, words.length); len++) {
      for (let i = 0; i <= words.length - len; i++) {
        const phrase = words.slice(i, i + len).join(' ');
        if (phrase.toLowerCase().includes(prefix) && phrase.length >= 5) {
          // Avoid too short phrases like "is a", "for the"
          const hasStopWords = /^(is|are|the|a|an|for|to|in|on|at|with|by)\s/i.test(phrase);
          if (!hasStopWords) {
            keywords.push(phrase.trim());
          }
        }
      }
    }
    
    // Strategy 4: If no keywords found, use first 3-5 words of subject (fallback)
    if (keywords.length === 0) {
      const firstWords = words.slice(0, Math.min(5, words.length)).join(' ');
      if (firstWords.toLowerCase().includes(prefix)) {
        keywords.push(firstWords.trim());
      }
    }
    
    // Deduplicate and sort by length (prefer shorter, more specific keywords)
    const uniqueKeywords = Array.from(new Set(keywords))
      .filter(k => k.length >= 3 && k.length <= 50) // Reasonable length
      .sort((a, b) => a.length - b.length); // Shorter first
    
    // Return top 3 keywords per subject (avoid clutter)
    return uniqueKeywords.slice(0, 3);
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
