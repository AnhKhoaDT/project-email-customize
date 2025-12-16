import { Injectable } from '@nestjs/common';
import { GmailService } from './gmail.service';

/**
 * Fuzzy Search Service - Week 3 Feature F1
 * 
 * Implements typo-tolerant and partial matching search for emails.
 * Searches over subject, sender (name and email), and optionally body/summary.
 * Returns results ranked by relevance score.
 */
@Injectable()
export class FuzzySearchService {
  constructor(private gmailService: GmailService) {}

  /**
   * Calculate Levenshtein distance (edit distance) between two strings
   * Used for typo tolerance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Calculate fuzzy match score between query and text
   * Returns score between 0 (no match) and 1 (perfect match)
   */
  private fuzzyMatchScore(query: string, text: string): number {
    if (!text) return 0;

    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    // Exact match
    if (textLower.includes(queryLower)) {
      return 1.0;
    }

    // Split query into words for partial matching
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0);
    const textWords = textLower.split(/\s+/).filter(w => w.length > 0);

    let totalScore = 0;
    let matchCount = 0;

    for (const qWord of queryWords) {
      let bestWordScore = 0;

      for (const tWord of textWords) {
        // Partial match (substring)
        if (tWord.includes(qWord) || qWord.includes(tWord)) {
          const lengthRatio = Math.min(qWord.length, tWord.length) / Math.max(qWord.length, tWord.length);
          bestWordScore = Math.max(bestWordScore, 0.8 * lengthRatio);
        }

        // Typo tolerance using Levenshtein distance
        const distance = this.levenshteinDistance(qWord, tWord);
        const maxLen = Math.max(qWord.length, tWord.length);
        const similarity = 1 - (distance / maxLen);

        // Only consider if similarity is above threshold (60%)
        if (similarity > 0.6) {
          bestWordScore = Math.max(bestWordScore, similarity * 0.7);
        }
      }

      totalScore += bestWordScore;
      if (bestWordScore > 0) matchCount++;
    }

    // Average score weighted by match coverage
    return queryWords.length > 0 ? (totalScore / queryWords.length) * (matchCount / queryWords.length) : 0;
  }

  /**
   * Calculate overall relevance score for an email
   */
  private calculateRelevanceScore(query: string, email: any): number {
    const subjectScore = this.fuzzyMatchScore(query, email.subject || '') * 2.0; // Subject most important
    const fromScore = this.fuzzyMatchScore(query, email.from || '') * 1.5;
    const snippetScore = this.fuzzyMatchScore(query, email.snippet || '') * 1.0;
    
    // Optional: search in body if available
    const bodyScore = email.textBody 
      ? this.fuzzyMatchScore(query, email.textBody || '') * 0.8 
      : 0;

    const totalScore = subjectScore + fromScore + snippetScore + bodyScore;
    const weights = 2.0 + 1.5 + 1.0 + (email.textBody ? 0.8 : 0);

    return totalScore / weights;
  }

  /**
   * Perform fuzzy search across all emails
   * @param userId - User ID for authentication
   * @param query - Search query string
   * @param options - Search options (limit, includeBody)
   * @returns Ranked list of matching emails
   */
  async fuzzySearch(
    userId: string, 
    query: string, 
    options: { limit?: number; includeBody?: boolean } = {}
  ): Promise<any> {
    try {
      const { limit = 50, includeBody = false } = options;

      // Fetch emails from Gmail inbox (could be expanded to all mailboxes)
      const inboxData = await this.gmailService.listMessagesInLabel(userId, 'INBOX', 200); // Fetch more for better results
      
      if (!inboxData?.messages || inboxData.messages.length === 0) {
        return {
          status: 200,
          data: {
            query,
            results: [],
            totalResults: 0,
          },
        };
      }

      // Calculate relevance scores for each email
      const scoredEmails = [];
      
      for (const email of inboxData.messages) {
        // Optionally fetch full body for more accurate search
        let emailWithBody: any = email;
        if (includeBody && email.id) {
          try {
            const fullEmail = await this.gmailService.getMessage(userId, email.id);
            emailWithBody = { ...email, textBody: fullEmail.textBody };
          } catch (err) {
            // Skip if can't fetch full email
          }
        }

        const score = this.calculateRelevanceScore(query, emailWithBody);
        
        // Only include emails with score above threshold (0.2 = 20% match)
        if (score > 0.2) {
          scoredEmails.push({
            ...emailWithBody,
            relevanceScore: score,
          });
        }
      }

      // Sort by relevance score (best matches first)
      scoredEmails.sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Limit results
      const results = scoredEmails.slice(0, limit);

      return {
        status: 200,
        data: {
          query,
          results,
          totalResults: scoredEmails.length,
        },
      };
    } catch (err) {
      throw new Error(`Fuzzy search failed: ${err.message}`);
    }
  }

  /**
   * Get search suggestions based on query
   * Returns possible matches from sender names and subjects
   */
  async getSearchSuggestions(userId: string, query: string): Promise<string[]> {
    try {
      if (!query || query.length < 2) return [];

      const inboxData = await this.gmailService.listMessagesInLabel(userId, 'INBOX', 100);
      
      if (!inboxData?.messages) return [];

      const suggestions = new Set<string>();
      const queryLower = query.toLowerCase();

      for (const email of inboxData.messages) {
        // Add sender name suggestions
        if (email.from && email.from.toLowerCase().includes(queryLower)) {
          suggestions.add(email.from);
        }

        // Add subject keyword suggestions
        if (email.subject && email.subject.toLowerCase().includes(queryLower)) {
          // Extract words from subject
          const words = email.subject.split(/\s+/).filter(w => 
            w.length > 3 && w.toLowerCase().includes(queryLower)
          );
          words.forEach(word => suggestions.add(word));
        }
      }

      return Array.from(suggestions).slice(0, 10); // Return top 10 suggestions
    } catch (err) {
      return [];
    }
  }
}
