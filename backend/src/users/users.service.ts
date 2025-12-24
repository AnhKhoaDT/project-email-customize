import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  private async ensureDemoUser() {
    const existing = await this.userModel.findOne({ email: 'demo@demo.com' }).exec();
    if (!existing) {
      const hash = await bcrypt.hash('demo123', 10);
      await this.userModel.create({ email: 'demo@demo.com', name: 'Demo User', passwordHash: hash });
    }
  }

  async findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  async createUser(payload: { email: string; password: string; name?: string; phone?: string; address?: string; dateOfBirth?: string }) {
    const existing = await this.userModel.findOne({ email: payload.email.toLowerCase() }).exec();
    if (existing) throw new ConflictException('Email already registered');
    const hash = await bcrypt.hash(payload.password, 10);
    const doc = {
      email: payload.email.toLowerCase(),
      name: payload.name || payload.email.split('@')[0],
      passwordHash: hash,
      phone: payload.phone || undefined,
      address: payload.address || undefined,
      dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : undefined,
    } as any;
    const created = await this.userModel.create(doc);
    return created;
  }

  async updateUser(userId: string, updates: { name?: string; phone?: string; address?: string; dateOfBirth?: string }) {
    const $set: any = {};
    if (updates.name !== undefined) $set.name = updates.name;
    if (updates.phone !== undefined) $set.phone = updates.phone;
    if (updates.address !== undefined) $set.address = updates.address;
    if (updates.dateOfBirth !== undefined) $set.dateOfBirth = updates.dateOfBirth ? new Date(updates.dateOfBirth) : null;
    return this.userModel.findByIdAndUpdate(userId, { $set }, { new: true }).exec();
  }

  async removeUser(userId: string) {
    return this.userModel.findByIdAndDelete(userId).exec();
  }

  async createFromOAuth({ email, name }: { email: string; name?: string }) {
    const fakeHash = await bcrypt.hash(Math.random().toString(36), 10);
    const created = await this.userModel.create({ email, name: name || email.split('@')[0], passwordHash: fakeHash });
    return created;
  }

  async setGoogleRefreshToken(userId: string, refreshToken: string) {
    return this.userModel.findByIdAndUpdate(userId, { googleRefreshToken: refreshToken }, { new: true }).exec();
  }

  async getGoogleRefreshToken(userId: string) {
    const u = await this.userModel.findById(userId).exec();
    return u?.googleRefreshToken || null;
  }

  /**
   * Mark user as indexed for semantic search
   */
  async markAsIndexed(userId: string) {
    return this.userModel.findByIdAndUpdate(
      userId, 
      { 
        isSemanticSearchIndexed: true,
        lastIndexedAt: new Date()
      }, 
      { new: true }
    ).exec();
  }
}
