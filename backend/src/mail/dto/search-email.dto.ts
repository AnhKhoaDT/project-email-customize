import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchEmailDto {
  @IsString()
  q: string; // Search query

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20; // Default: 20 results

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0; // Default: 0 (for pagination)

  @IsOptional()
  @IsString()
  status?: string; // Optional: filter by status (TODO, IN_PROGRESS, DONE)

  @IsOptional()
  @IsString()
  from?: string; // Optional: filter by sender email (exact match for contact suggestions)
}

export interface SearchEmailResult {
  id: string;
  emailId: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  receivedDate: Date;
  status?: string;
  summary?: string;
  score?: number; // Relevance score from Fuse.js
}

export interface SearchEmailResponse {
  hits: SearchEmailResult[];
  query: string;
  totalHits: number;
  offset: number;
  limit: number;
  processingTimeMs: number;
}
