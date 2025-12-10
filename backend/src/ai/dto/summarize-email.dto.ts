import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class SummarizeEmailDto {
  @IsOptional()
  @IsString()
  emailId?: string;

  @IsString()
  sender: string;

  @IsString()
  subject: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsBoolean()
  forceRegenerate?: boolean;

  @IsOptional()
  @IsBoolean()
  structured?: boolean; // Return structured JSON with urgency/action
}
