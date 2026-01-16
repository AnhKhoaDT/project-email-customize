import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  passwordHash: string;
  
  @Prop()
  phone?: string;

  @Prop()
  address?: string;

  @Prop({ type: Date })
  dateOfBirth?: Date;

  @Prop()
  googleRefreshToken?: string;

  /**
   * Gmail History API anchor for incremental syncs
   * Stored as string (Gmail historyId)
   */
  @Prop()
  lastHistoryId?: string;

  // Semantic Search: Track if user's emails have been indexed
  @Prop({ default: false })
  isSemanticSearchIndexed?: boolean;

  @Prop({ type: Date })
  lastIndexedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
