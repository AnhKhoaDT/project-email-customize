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
            const { sender, subject, body, emailId, forceRegenerate } = dto;

            // Validate input
            if (!sender || !subject || !body) {
                throw new BadRequestException('Missing required fields: sender, subject, body');
            }

            // Check cache if emailId provided and not forcing regeneration
            if (emailId && !forceRegenerate) {
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
            const summary = await this.aiService.summarizeEmail(sender, subject, body);

            if (!summary) {
                throw new InternalServerErrorException('Failed to generate summary');
            }

            // Cache summary if emailId provided
            if (emailId) {
                await this.aiService.cacheSummary(emailId, summary);
            }

            return {
                summary,
                emailId,
                cached: false,
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
     * Batch summarize multiple emails
     * POST /ai/summarize/batch
     * Body: { emails: [{ emailId, sender, subject, body }] }
     */
    @UseGuards(JwtAuthGuard)
    @Post('summarize/batch')
    async batchSummarize(@Req() req: any, @Body() dto: BatchSummarizeDto) {
        try {
            const { emails } = dto;

            if (!emails || emails.length === 0) {
                throw new BadRequestException('No emails provided');
            }

            const results = await Promise.allSettled(
                emails.map(async (email) => {
                    // Check cache first
                    if (email.emailId) {
                        const cached = await this.aiService.getCachedSummary(email.emailId);
                        if (cached) {
                            return {
                                emailId: email.emailId,
                                summary: cached.summary,
                                cached: true,
                            };
                        }
                    }

                    // Generate summary
                    const summary = await this.aiService.summarizeEmail(
                        email.sender,
                        email.subject,
                        email.body
                    );

                    // Cache if emailId provided
                    if (email.emailId && summary) {
                        await this.aiService.cacheSummary(email.emailId, summary);
                    }

                    return {
                        emailId: email.emailId,
                        summary,
                        cached: false,
                    };
                })
            );

            const summaries = [];
            const failed = [];

            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    summaries.push(result.value);
                } else {
                    failed.push({
                        emailId: emails[index].emailId,
                        error: result.reason?.message || 'Unknown error',
                    });
                }
            });

            return {
                summaries,
                failed,
                total: emails.length,
                successful: summaries.length,
            };
        } catch (err) {
            if (err instanceof BadRequestException) {
                throw err;
            }
            throw new InternalServerErrorException(err?.message || 'Failed to batch summarize');
        }
    }
}