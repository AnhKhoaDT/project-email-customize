import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as jwt from 'jsonwebtoken';
import { SessionDocument, Session } from './sessions.schema';

@Injectable()
export class SessionsService {
  constructor(@InjectModel(Session.name) private sessionModel: Model<SessionDocument>) {}

  async create(token: string, userId: string): Promise<SessionDocument> {
    // try to decode exp from token to set expiresAt
    let expiresAt: Date | undefined = undefined;
    try {
      const decoded: any = jwt.decode(token);
      if (decoded && decoded.exp) expiresAt = new Date(decoded.exp * 1000);
    } catch (err) {
      // ignore
    }
    const doc = await this.sessionModel.create({ token, user: userId, expiresAt });
    return doc;
  }

  /**
   * Create a session for the user; if any existing sessions for the user exist,
   * remove them first so we keep a single session record per user.
   */
  async createOrReplace(token: string, userId: string): Promise<SessionDocument> {
    // remove existing sessions for this user
    await this.sessionModel.deleteMany({ user: userId }).exec();
    return this.create(token, userId);
  }

  async findByToken(token: string): Promise<SessionDocument | null> {
    return this.sessionModel.findOne({ token, revoked: { $ne: true } }).exec();
  }

  async deleteByToken(token: string): Promise<any> {
    return this.sessionModel.findOneAndDelete({ token }).exec();
  }

  async deleteByUser(userId: string): Promise<any> {
    return this.sessionModel.deleteMany({ user: userId }).exec();
  }
}
