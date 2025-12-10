import { Controller, Post, Body, UseGuards, Req, BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { AiService } from "./ai.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SummarizeEmailDto } from "./dto/summarize-email.dto";
import { BatchSummarizeDto } from "./dto/batch-summarize.dto";

@Controller('ai')
export class AiController {
    constructor(private aiService: AiService) {}

    /**
     * Summarize a single email
     * POST /ai/summarize
     * Body: { emailId?, sender, subject, body, forceRegenerate? }
     */
    @UseGuards(JwtAuthGuard)
    @Post('summarize')
    async summarize(@Req() req: any, @Body() dto: SummarizeEmailDto) {
        try {
            const { sender, subject, body, emailId, forceRegenerate, structured } = dto;

            // Validate input
            if (!sender || !subject || !body) {
                throw new BadRequestException('Missing required fields: sender, subject, body');
            }

            // Check cache if emailId provided and not forcing regeneration (only for non-structured)
            if (emailId && !forceRegenerate && !structured) {
                const cached = await this.aiService.getCachedSummary(emailId);
                if (cached) {
                    return {
                        summary: cached.summary,
                        emailId,
                        cached: true,
                        cachedAt: cached.createdAt,
                    };
                }
            }

            // Generate new summary
            const summary = await this.aiService.summarizeEmail(
                sender, 
                subject, 
                body,
                { structured }
            );

            if (!summary) {
                throw new InternalServerErrorException('Failed to generate summary');
            }

            // Cache summary if emailId provided (only cache string summaries)
            if (emailId && typeof summary === 'string') {
                await this.aiService.cacheSummary(emailId, summary);
            }

            return {
                summary,
                emailId,
                cached: false,
                structured: !!structured,
                cachedAt: new Date(),
            };
        } catch (err) {
            if (err instanceof BadRequestException || err instanceof InternalServerErrorException) {
                throw err;
            }
            throw new InternalServerErrorException(err?.message || 'Failed to summarize email');
        }
    }

    /**
     * Batch summarize multiple emails (with rate limiting)
     * POST /ai/summarize/batch
     * Body: { emails: [{ emailId, sender, subject, body }], structured?: boolean, useCache?: boolean }
     */
    @UseGuards(JwtAuthGuard)
    @Post('summarize/batch')
    async batchSummarize(@Req() req: any, @Body() dto: BatchSummarizeDto) {
        try {
            const { emails, structured, useCache, maxConcurrency } = dto;

            if (!emails || emails.length === 0) {
                throw new BadRequestException('No emails provided');
            }

            // Transform to expected format
            const emailsFormatted = emails.map(e => ({
                id: e.emailId || `temp-${Date.now()}-${Math.random()}`,
                sender: e.sender,
                subject: e.subject,
                body: e.body,
            }));

            // Use the hybrid batch method with controlled concurrency
            const results = await this.aiService.summarizeMultipleEmails(
                emailsFormatted,
                { structured, useCache, maxConcurrency }
            );

            return {
                summaries: results.map(r => ({
                    emailId: r.emailId,
                    summary: r.summary,
                })),
                total: emails.length,
                successful: results.length,
                concurrency: maxConcurrency || 3,
            };
        } catch (err) {
            if (err instanceof BadRequestException) {
                throw err;
            }
            throw new InternalServerErrorException(err?.message || 'Failed to batch summarize');
        }
    }
}