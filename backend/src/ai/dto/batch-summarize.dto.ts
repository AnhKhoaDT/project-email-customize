import { IsArray, ValidateNested, ArrayMinSize, IsOptional, IsBoolean, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class EmailToSummarize {
  emailId?: string;
  sender: string;
  subject: string;
  body: string;
}

export class BatchSummarizeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EmailToSummarize)
  emails: EmailToSummarize[];

  @IsOptional()
  @IsBoolean()
  structured?: boolean; // Return structured JSON with urgency/action

  @IsOptional()
  @IsBoolean()
  useCache?: boolean; // Use cache (default: true)

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxConcurrency?: number; // Max concurrent API calls (1-10, default: 3)
}
