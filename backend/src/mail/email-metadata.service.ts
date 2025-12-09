import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmailMetadata, EmailMetadataDocument } from './schemas/email-metadata.schema';

const logger = new Logger('EmailMetadataService');

@Injectable()
export class EmailMetadataService {
  constructor(
    @InjectModel(EmailMetadata.name)
    private emailMetadataModel: Model<EmailMetadataDocument>,
  ) {}

  // ============================================
  // STATUS METHODS 
  // ============================================

  async updateEmailStatus(
    userId: string,
    emailId: string,
    threadId: string,
    status: string,
  ) {
    return this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      {
        userId,
        emailId,
        threadId,
        status,
        statusUpdatedAt: new Date(),
      },
      { upsert: true, new: true },
    );
  }

  async findEmail(userId: string, emailId: string) {
    return this.emailMetadataModel.findOne({ userId, emailId });
  }

  async deleteEmail(userId: string, emailId: string) {
    return this.emailMetadataModel.findOneAndDelete({ userId, emailId });
  }

  async createEmailMetadata(data: {
    userId: string;
    emailId: string;
    threadId: string;
    status: string;
    subject?: string;
    from?: string;
    snippet?: string;
    receivedDate?: Date;
  }) {
    const metadata = new this.emailMetadataModel({
      ...data,
      statusUpdatedAt: new Date(),
    });
    return metadata.save();
  }

  async getEmailsByStatus(userId: string, status: string) {
    return this.emailMetadataModel.find({ userId, status }).sort({ statusUpdatedAt: -1 });
  }

  async getAllEmailsForUser(userId: string) {
    return this.emailMetadataModel.find({ userId }).sort({ statusUpdatedAt: -1 });
  }



  // ============================================
  // SUMMARY METHODS
  // ============================================

  async saveSummary(
    userId: string,
    emailId: string,
    threadId: string,
    summary: string,
    model: string,
  ) {
    return this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      {
        userId,
        emailId,
        threadId,
        summary,
        summaryGeneratedAt: new Date(),
        summaryModel: model,
      },
      { upsert: true, new: true },
    );
  }

  async getSummary(userId: string, emailId: string) {
    const metadata = await this.emailMetadataModel.findOne({ userId, emailId });
    return metadata?.summary || null;
  }

  async getSummariesForEmails(userId: string, emailIds: string[]) {
    const metadatas = await this.emailMetadataModel.find({
      userId,
      emailId: { $in: emailIds },
      summary: { $exists: true },
    });

    // Return as map: {emailId: summary}
    return metadatas.reduce((acc, meta) => {
      acc[meta.emailId] = meta.summary;
      return acc;
    }, {} as Record<string, string>);
  }

  // ============================================
  // SNOOZE METHODS
  // ============================================

  async snoozeEmail(
    userId: string,
    emailId: string,
    threadId: string,
    snoozedUntil: Date,
    originalStatus: string,
  ) {
    return this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      {
        userId,
        emailId,
        threadId,
        snoozedUntil,
        originalStatus,
        isSnoozed: true,
      },
      { upsert: true, new: true },
    );
  }

  async unsnoozeEmail(userId: string, emailId: string) {
    return this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      {
        isSnoozed: false,
        snoozedUntil: null,
        originalStatus: null,
      },
      { new: true },
    );
  }

  async getExpiredSnoozes() {
    return this.emailMetadataModel.find({
      isSnoozed: true,
      snoozedUntil: { $lte: new Date() },
    });
  }

  async deleteSnooze(userId: string, emailId: string) {
    return this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      {
        isSnoozed: false,
        snoozedUntil: null,
        originalStatus: null,
      },
    );
  }

  // ============================================
  // CACHE METHODS (Optional)
  // ============================================

  async cacheEmailBasicData(
    userId: string,
    emailId: string,
    threadId: string,
    data: {
      subject?: string;
      from?: string;
      snippet?: string;
      receivedDate?: Date;
    },
  ) {
    return this.emailMetadataModel.findOneAndUpdate(
      { userId, emailId },
      {
        userId,
        emailId,
        threadId,
        ...data,
      },
      { upsert: true, new: true },
    );
  }
}
