export class ReplyEmailDto {
  body: string;
  isHtml?: boolean;
  attachments?: Array<{
    filename: string;
    content: string; // base64 encoded
    contentType?: string;
  }>;
}
