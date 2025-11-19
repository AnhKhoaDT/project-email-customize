import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginDto) {
    const { email, password } = body;
    return this.authService.loginLocal(email, password);
  }

  @Post('google')
  async google(@Body() body: { token?: string; email?: string; name?: string }) {
    // Accept either a third-party token (not validated here) or direct email+name for mocking
    if (!body.email) throw new UnauthorizedException('Google token missing');
    return this.authService.exchangeGoogleToken({ email: body.email, name: body.name });
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  async logout(@Body() body: { refreshToken: string }) {
    this.authService.logout(body.refreshToken);
    return { ok: true };
  }
}
