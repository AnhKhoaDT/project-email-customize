import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'access-secret-example';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'refresh-secret-example';
const ACCESS_EXPIRES_IN = '15m';
const REFRESH_EXPIRES_IN = '7d';

@Injectable()
export class AuthService {
  private refreshTokenStore = new Map<string, string>(); // refreshToken -> userId

  constructor(private usersService: UsersService) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return null;
    return { id: user.id, email: user.email, name: user.name };
  }

  signAccessToken(payload: object) {
    return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
  }

  signRefreshToken(payload: object) {
    return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
  }

  async loginLocal(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const accessToken = this.signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = this.signRefreshToken({ sub: user.id });
    this.refreshTokenStore.set(refreshToken, user.id);
    return { accessToken, refreshToken, user };
  }

  async exchangeGoogleToken(googlePayload: { email: string; name?: string }) {
    // In a real app, verify the google token; here we accept the provided email and name
    let user = await this.usersService.findByEmail(googlePayload.email);
    if (!user) {
      user = await this.usersService.createFromOAuth({ email: googlePayload.email, name: googlePayload.name || 'Google User' });
    }
    const accessToken = this.signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = this.signRefreshToken({ sub: user.id });
    this.refreshTokenStore.set(refreshToken, user.id);
    return { accessToken, refreshToken, user };
  }

  async refresh(refreshToken: string) {
    try {
      const payload: any = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
      const stored = this.refreshTokenStore.get(refreshToken);
      if (!stored || stored !== payload.sub) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const user = await this.usersService.findById(payload.sub);
      if (!user) throw new UnauthorizedException('User not found');
      const accessToken = this.signAccessToken({ sub: user.id, email: user.email });
      return { accessToken };
    } catch (err) {
      throw new UnauthorizedException('Refresh failed');
    }
  }

  logout(refreshToken: string) {
    this.refreshTokenStore.delete(refreshToken);
  }
}
