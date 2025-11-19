import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

type User = { id: string; email: string; name: string; passwordHash: string };

@Injectable()
export class UsersService {
  private users: User[] = [];

  constructor() {
    // Create a demo user: demo@demo.com / password: demo123
    const hash = bcrypt.hashSync('demo123', 10);
    this.users.push({ id: '1', email: 'demo@demo.com', name: 'Demo User', passwordHash: hash });
  }

  async findByEmail(email: string) {
    return this.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async findById(id: string) {
    return this.users.find((u) => u.id === id) || null;
  }

  async createFromOAuth({ email, name }: { email: string; name?: string }) {
    const id = String(this.users.length + 1);
    const fakeHash = bcrypt.hashSync(Math.random().toString(36), 10);
    const user = { id, email, name: name || email.split('@')[0], passwordHash: fakeHash };
    this.users.push(user);
    return user;
  }
}
