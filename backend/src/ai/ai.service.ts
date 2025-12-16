import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

/**
 * Structured summary result with urgency and action items
 */
export interface SummaryResult {
    summary: string;
    urgency?: 'high' | 'medium' | 'low';
    action?: string;
}

/**
 * Options for summarization
 */
export interface SummarizeOptions {
    structured?: boolean;     // Return structured JSON with urgency/action
    useCache?: boolean;       // Use cache (default: true)
    maxConcurrency?: number;  // Max concurrent API calls for batch (default: 3)
}

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private genAI: GoogleGenerativeAI;
    private model: GenerativeModel;
    
    // In-memory cache for summaries (in production, use Redis or MongoDB)
    private summaryCache: Map<string, { summary: string; createdAt: Date }> = new Map();
    
    // Fallback models in priority order (best to worst)
    private readonly FALLBACK_MODELS = [
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.5-pro',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
    ];

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
            this.logger.warn('⚠️  GEMINI_API_KEY not configured - AI features will not work');
            this.logger.warn('Get your API key from: https://ai.google.dev/');
        } else {
            this.genAI = new GoogleGenerativeAI(apiKey);
            // Use primary model: Gemini 2.5 Flash - Best for price-performance
            this.model = this.genAI.getGenerativeModel({ model: this.FALLBACK_MODELS[0] });
            this.logger.log(`✅ Gemini AI initialized with primary model: ${this.FALLBACK_MODELS[0]}`);
        }
    }
    
    /**
     * Get a Gemini model by name
     */
    private getModel(modelName: string): GenerativeModel {
        return this.genAI.getGenerativeModel({ model: modelName });
    }
    
    /**
     * Check if error is a quota/rate limit error
     */
    private isQuotaError(error: any): boolean {
        const errorMessage = error?.message?.toLowerCase() || '';
        const errorStatus = error?.status || error?.statusCode || 0;
        
        return (
            errorStatus === 429 ||
            errorStatus === 503 ||
            errorMessage.includes('quota') ||
            errorMessage.includes('rate limit') ||
            errorMessage.includes('resource exhausted') ||
            errorMessage.includes('429')
        );
    }

    /**
     * Summarize email with optional structured output
     * @param sender - Email sender
     * @param subject - Email subject
     * @param body - Email body content
     * @param options - Summarization options (structured output, cache)
     * @returns Summary string or structured SummaryResult
     */
    async summarizeEmail(
        sender: string, 
        subject: string, 
        body: string,
        options?: SummarizeOptions
    ): Promise<string | SummaryResult> {
        if (!this.model) {
            this.logger.warn('Gemini AI not initialized - using fallback summary');
            return this.createFallbackSummary(sender, subject, body);
        }

        try {
            // 1. Pre-processing: Clean and truncate body if too long
            const cleanBody = this.cleanEmailBody(body);
            const truncatedBody = cleanBody.substring(0, 5000);

            // 2. Prompt Engineering based on options
            let prompt: string;
            
            if (options?.structured) {
                // Structured output with urgency and action items (for Kanban)
                prompt = `
You are an expert email analyzer.

Task: Analyze and summarize the following email in JSON format.

Requirements:
1. summary: 1-2 concise sentences summarizing the main topic
2. urgency: Classify as "high", "medium", or "low" based on:
   - high: Deadlines within 24 hours, urgent requests, critical issues
   - medium: Normal business communications, requests with reasonable timeframe
   - low: FYI emails, newsletters, non-urgent updates
3. action: Required action or null if no action needed

Email Details:
From: ${sender}
Subject: ${subject}

Body:
${truncatedBody}

Respond ONLY with valid JSON in this exact format:
{
  "summary": "Your summary here",
  "urgency": "high|medium|low",
  "action": "Required action or null"
}
                `.trim();
            } else {
                // Simple summary (default) - Optimized for Kanban cards
                prompt = `
You are an expert email analyst. Your job is to READ, UNDERSTAND, and CREATE a super short summary.

EXAMPLES (Learn from these):
- Email: "Google AI Studio và Vertex AI hỗ trợ Gemini models..." → Summary: "Gemini models có sẵn trên Google AI Studio"
- Email: "Meeting rescheduled to 3pm tomorrow due to conflict" → Summary: "Meeting moved to 3pm tomorrow"
- Email: "Your package #12345 has been delivered to your address" → Summary: "Package delivered successfully"

YOUR TASK:
1. Read the email below carefully
2. Identify the MAIN point (not just copy text)
3. Write ONE sentence summary (max 12 words)
4. Use the SAME language as the email body

DO NOT:
- Copy/paste email text directly
- Start with "Email from..." or "Hiện tại..."
- Include greetings or signatures
- Use more than 12 words

Email Details:
From: ${sender}
Subject: ${subject}
Content: ${truncatedBody}

Think: What is the ONE key message?
Your summary (max 12 words):`.trim();
            }

            // 3. Call Gemini API with fallback
            let text: string;
            let usedModel: string | null = null;
            
            // Try each model in fallback order
            for (let i = 0; i < this.FALLBACK_MODELS.length; i++) {
                const modelName = this.FALLBACK_MODELS[i];
                
                try {
                    const model = this.getModel(modelName);
                    const result = await model.generateContent(prompt);
                    const response = await result.response;
                    text = response.text();
                    usedModel = modelName;
                    
                    // Log if using fallback model
                    if (i > 0) {
                        this.logger.log(`✅ Succeeded with fallback model: ${modelName} (attempt ${i + 1}/${this.FALLBACK_MODELS.length})`);
                    }
                    
                    break; // Success, exit loop
                } catch (error) {
                    const isLastModel = i === this.FALLBACK_MODELS.length - 1;
                    
                    if (this.isQuotaError(error)) {
                        this.logger.warn(`⚠️  Model ${modelName} quota exceeded, trying next model...`);
                        
                        if (isLastModel) {
                            this.logger.error('❌ All models exhausted - using fallback summary');
                            throw new Error('All Gemini models quota exceeded');
                        }
                        // Continue to next model
                    } else {
                        // Non-quota error, throw immediately
                        this.logger.error(`❌ Model ${modelName} error: ${error.message}`);
                        throw error;
                    }
                }
            }

            // 4. Parse response
            if (options?.structured) {
                try {
                    // Extract JSON from response (handle markdown code blocks)
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]) as SummaryResult;
                        return parsed;
                    }
                } catch (parseError) {
                    this.logger.warn('Failed to parse structured response, falling back to simple summary');
                }
            }

            const summary = text.trim();
            return summary;
        } catch (error) {
            this.logger.error(`Failed to summarize email: ${error.message}`, error.stack);
            // Return fallback summary instead of null
            return this.createFallbackSummary(sender, subject, body);
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

    /**
     * Batch summarize multiple emails with controlled concurrency
     * Processes emails in chunks to balance speed vs API quota limits
     * 
     * @param emails - Array of emails to summarize
     * @param options - Summarization options (structured, useCache, maxConcurrency)
     * @returns Array of email IDs with their summaries
     * 
     * @example
     * // Process 10 emails, 3 at a time
     * await summarizeMultipleEmails(emails, { maxConcurrency: 3 });
     */
    async summarizeMultipleEmails(
        emails: Array<{ id: string; sender: string; subject: string; body: string }>,
        options?: SummarizeOptions
    ): Promise<Array<{ emailId: string; summary: string | SummaryResult }>> {
        if (!emails || emails.length === 0) {
            return [];
        }

        const maxConcurrency = options?.maxConcurrency || 3; // Default: 3 concurrent requests
        const results = [];

        // Process emails in chunks
        for (let i = 0; i < emails.length; i += maxConcurrency) {
            const chunk = emails.slice(i, i + maxConcurrency);

            // Process chunk in parallel
            const chunkResults = await Promise.allSettled(
                chunk.map(async (email) => {
                    try {
                        // Check cache first (if enabled)
                        if (options?.useCache !== false) {
                            const cached = await this.getCachedSummary(email.id);
                            if (cached) {
                                return { emailId: email.id, summary: cached.summary };
                            }
                        }

                        // Generate new summary
                        const summary = await this.summarizeEmail(
                            email.sender,
                            email.subject,
                            email.body,
                            options
                        );

                        // Cache it (only cache string summaries)
                        if (typeof summary === 'string') {
                            await this.cacheSummary(email.id, summary);
                        }

                        return { emailId: email.id, summary };

                    } catch (error) {
                        this.logger.error(`✗ Failed to summarize ${email.id}:`, error.message);
                        throw error; // Re-throw to be caught by Promise.allSettled
                    }
                })
            );

            // Collect results from chunk
            chunkResults.forEach((result, idx) => {
                const email = chunk[idx];
                
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    // Use fallback for failed emails
                    this.logger.warn(`Using fallback summary for ${email.id}`);
                    results.push({
                        emailId: email.id,
                        summary: this.createFallbackSummary(email.sender, email.subject, email.body)
                    });
                }
            });

            // Rate limiting: delay between chunks (except after last chunk)
            if (i + maxConcurrency < emails.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return results;
    }

    /**
     * Create fallback summary when AI is not available
     * @param sender - Email sender
     * @param subject - Email subject
     * @param body - Email body
     * @returns Fallback summary string
     */
    private createFallbackSummary(sender: string, subject: string, body: string): string {
        const cleanBody = this.cleanEmailBody(body);
        const bodyPreview = cleanBody.substring(0, 150).trim();

        return `Email from ${sender} regarding: ${subject}. ${bodyPreview}${bodyPreview.length >= 150 ? '...' : ''}`;
    }
    /**
     * Generate embedding vector for text using Gemini API
     * Used for semantic search (Week 4 Feature I)
     * @param text - Text to generate embedding for
     * @returns Vector embedding (array of numbers)
     */
    async generateEmbedding(text: string): Promise<number[]> {
        if (!this.genAI) {
            throw new Error('Gemini AI not initialized. Please set GEMINI_API_KEY in .env file');
        }

        try {
            // Use Gemini embedding model
            const embeddingModel = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
            
            // Clean and truncate text for embedding (max 2048 tokens)
            const cleanText = text
                .replace(/<[^>]*>/g, '') // Remove HTML
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim()
                .substring(0, 8000); // Rough character limit

            const result = await embeddingModel.embedContent(cleanText);
            const embedding = result.embedding.values;

            this.logger.log(`✅ Generated embedding (${embedding.length} dimensions) for text: ${cleanText.substring(0, 50)}...`);
            
            return embedding;
        } catch (error) {
            this.logger.error('Failed to generate embedding:', error.message);
            throw new Error(`Embedding generation failed: ${error.message}`);
        }
    }}

