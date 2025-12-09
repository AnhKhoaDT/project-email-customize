import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

const logger = new Logger('AiService');

@Injectable()
export class AiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn('⚠️  GEMINI_API_KEY not found in environment variables');
      logger.warn('Please add GEMINI_API_KEY to your .env file');
      logger.warn('Get your API key from: https://ai.google.dev/');
    } else {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      logger.log('✅ Gemini AI initialized successfully');
    }
  }

  /**
   * Tóm tắt email bằng Gemini AI
   * @param emailData - Dữ liệu email cần tóm tắt
   * @returns Summary string
   */
  async summarizeEmail(emailData: {
    subject: string;
    from: string;
    body: string;
  }): Promise<string> {
    if (!this.model) {
      throw new Error('Gemini AI not initialized. Please set GEMINI_API_KEY in .env file');
    }

    try {
      // Prompt engineering để tạo summary chất lượng cao
      const prompt = `
You are an expert email summarizer. Your task is to create a concise, actionable summary of the email below.

**Requirements:**
1. Keep the summary under 3 sentences (max 100 words)
2. Focus on ACTION ITEMS and KEY POINTS
3. Use bullet points if there are multiple action items
4. Maintain professional tone
5. Identify urgency level (High/Medium/Low) if applicable

**Email Details:**
From: ${emailData.from}
Subject: ${emailData.subject}

**Email Body:**
${emailData.body.substring(0, 3000)} ${emailData.body.length > 3000 ? '...(truncated)' : ''}

**Output Format:**
Provide ONLY the summary in this format:
[Urgency: High/Medium/Low]
Summary: [Your concise summary here]
Action: [Required action if any, or "No action needed"]

Example:
[Urgency: High]
Summary: Client requesting urgent meeting to discuss Q4 budget concerns. Three options proposed for cost reduction.
Action: Review budget proposals and respond with available meeting times by EOD Friday.
`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const summary = response.text();

      logger.log(`✅ Email summarized: ${emailData.subject.substring(0, 50)}...`);
      return summary.trim();

    } catch (error) {
      logger.error('Failed to summarize email:', error);
      
      // Fallback: Tạo summary đơn giản từ snippet
      return this.createFallbackSummary(emailData);
    }
  }

  /**
   * Fallback summary khi AI không available
   */
  private createFallbackSummary(emailData: {
    subject: string;
    from: string;
    body: string;
  }): string {
    const bodyPreview = emailData.body
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .substring(0, 150)
      .trim();

    return `[Urgency: Medium]
Summary: Email from ${emailData.from} regarding: ${emailData.subject}
Preview: ${bodyPreview}...
Action: Review and respond as needed.`;
  }

  /**
   * Batch summarize multiple emails
   */
  async summarizeMultipleEmails(
    emails: Array<{ id: string; subject: string; from: string; body: string }>
  ): Promise<Array<{ emailId: string; summary: string }>> {
    const summaries = [];

    for (const email of emails) {
      try {
        const summary = await this.summarizeEmail({
          subject: email.subject,
          from: email.from,
          body: email.body
        });
        summaries.push({ emailId: email.id, summary });
        
        // Rate limiting: delay 1 second giữa các requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`Failed to summarize email ${email.id}:`, error);
        summaries.push({
          emailId: email.id,
          summary: this.createFallbackSummary(email)
        });
      }
    }

    return summaries;
  }
}
