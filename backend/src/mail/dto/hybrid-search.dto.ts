import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for Hybrid Search Suggestions
 * 
 * Query parameters for /search/hybrid-suggestions endpoint
 */
export class HybridSearchDto {
  @IsString()
  prefix: string; // Search prefix (min 2 chars)

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  limitTopHits?: number = 2; // Max top hits (default: 2)

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  limitKeywords?: number = 4; // Max keywords (default: 4)
}
