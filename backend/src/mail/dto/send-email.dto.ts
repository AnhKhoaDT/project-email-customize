export class SendEmailDto {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  attachments?: Array<{
    filename: string;
    content: string; // base64 encoded
    contentType?: string;
  }>;
}
