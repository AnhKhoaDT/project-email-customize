import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private genAI: GoogleGenerativeAI;
    private model: GenerativeModel;
    
    // In-memory cache for summaries (in production, use Redis or MongoDB)
    private summaryCache: Map<string, { summary: string; createdAt: Date }> = new Map();

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
            this.logger.warn('GEMINI_API_KEY not configured - AI features will not work');
        }
        this.genAI = new GoogleGenerativeAI(apiKey);

        // Use a stable model name
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    }

    async summarizeEmail(sender: string, subject: string, body: string): Promise<string> {
        try {
            // 1. Pre-processing: Clean and truncate body if too long
            const cleanBody = this.cleanEmailBody(body);
            const truncatedBody = cleanBody.substring(0, 5000);

            // 2. Prompt Engineering: Clear instructions for AI
            const prompt = `
You are an intelligent email assistant.

Task: Summarize the following email into 1-2 concise sentences in the same language as the email content.

Focus on:
- Main topic or request
- Key action items or deadlines
- Important context

Email Details:
From: ${sender}
Subject: ${subject}

Body:
${truncatedBody}

Provide a clear, concise summary (max 2 sentences):
            `.trim();

            // 3. Call Gemini API
            this.logger.debug(`Generating summary for email from ${sender}`);
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            const summary = text.trim();
            this.logger.debug(`Generated summary: ${summary.substring(0, 100)}...`);

            return summary;
        } catch (error) {
            this.logger.error(`Failed to summarize email: ${error.message}`, error.stack);
            // Return null on error - controller will handle it
            return null;
        }
    }

    /**
     * Clean email body by removing excessive whitespace and HTML tags
     */
    private cleanEmailBody(body: string): string {
        if (!body) return '';
        
        // Remove HTML tags (basic cleaning)
        let cleaned = body.replace(/<[^>]*>/g, ' ');
        
        // Decode HTML entities
        cleaned = cleaned
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
        
        // Remove excessive whitespace
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        
        return cleaned;
    }

    /**
     * Get cached summary for an email
     */
    async getCachedSummary(emailId: string): Promise<{ summary: string; createdAt: Date } | null> {
        if (!emailId) return null;
        
        const cached = this.summaryCache.get(emailId);
        if (cached) {
            this.logger.debug(`Cache hit for email ${emailId}`);
            return cached;
        }
        
        return null;
    }

    /**
     * Cache a summary for an email
     */
    async cacheSummary(emailId: string, summary: string): Promise<void> {
        if (!emailId || !summary) return;
        
        this.summaryCache.set(emailId, {
            summary,
            createdAt: new Date(),
        });
        
        this.logger.debug(`Cached summary for email ${emailId}`);
        
        // Optional: Limit cache size (FIFO eviction)
        if (this.summaryCache.size > 1000) {
            const firstKey = this.summaryCache.keys().next().value;
            this.summaryCache.delete(firstKey);
        }
    }

    /**
     * Clear summary cache (for testing or manual refresh)
     */
    clearCache(): void {
        this.summaryCache.clear();
        this.logger.log('Summary cache cleared');
    }
}

