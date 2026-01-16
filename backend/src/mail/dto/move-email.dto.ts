import { IsString, IsOptional, IsBoolean, IsNotEmpty } from 'class-validator';

/**
 * DTO for moving email between Kanban columns
 * Week 4 - Dynamic Kanban Configuration
 */
export class MoveEmailDto {
  @IsString()
  @IsNotEmpty()
  emailId: string; // Gmail message ID

  @IsString()
  @IsNotEmpty()
  fromColumnId: string; // Source column ID (or 'inbox' for INBOX)

  @IsString()
  @IsNotEmpty()
  toColumnId: string; // Destination column ID

  @IsOptional()
  @IsBoolean()
  optimistic?: boolean; // Default true: Update DB first, sync later

  @IsOptional()
  destinationIndex?: number; // Optional index within destination column for ordering
}

/**
 * Event payload for email.moved event
 * Dùng cho NestJS EventEmitter
 */
export interface EmailMovedEvent {
  userId: string;
  emailId: string;
  fromColumnId: string;
  toColumnId: string;
  labelsToAdd: string[];
  labelsToRemove: string[];
  metadataId: string;
  timestamp: Date;
}
