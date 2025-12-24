import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SearchSuggestionCacheDocument = SearchSuggestionCache & Document;

/**
 * Search Suggestion Cache Schema
 * 
 * Stores cached search suggestions with TTL for automatic expiration.
 * Hybrid approach: MongoDB persistent cache with auto-cleanup.
 * 
 * Features:
 * - TTL Index: Auto-delete after 1 hour (3600 seconds)
 * - Compound Index: Fast lookups by userId + prefix
 * - Cached suggestions from both senders and subjects
 */
@Schema({ timestamps: true })
export class SearchSuggestionCache {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  prefix: string;

  @Prop({ type: [String], required: true })
  suggestions: string[];

  @Prop({ type: String, enum: ['sender', 'subject', 'both'], default: 'both' })
  type: string;

  @Prop({ type: Date, default: Date.now, expires: 3600 }) // TTL: 1 hour
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const SearchSuggestionCacheSchema = SchemaFactory.createForClass(SearchSuggestionCache);

// Compound index for efficient queries
SearchSuggestionCacheSchema.index({ userId: 1, prefix: 1 }, { unique: true });
