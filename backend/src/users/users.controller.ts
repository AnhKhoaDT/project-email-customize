import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

function sanitizeUser(u: any) {
  if (!u) return null;
  return {
    id: u._id?.toString?.() || u.id,
    email: u.email,
    name: u.name,
    phone: u.phone || null,
    address: u.address || null,
    dateOfBirth: u.dateOfBirth ? new Date(u.dateOfBirth).toISOString() : null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post('register')
  async register(@Body() body: RegisterUserDto) {
    const created = await this.usersService.createUser(body as any);
    return sanitizeUser(created);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: any) {
    const u = await this.usersService.findById(req.user.id);
    return sanitizeUser(u);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me')
  async updateMe(@Req() req: any, @Body() body: UpdateUserDto) {
    const updated = await this.usersService.updateUser(req.user.id, body as any);
    return sanitizeUser(updated);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  async deleteMe(@Req() req: any) {
    await this.usersService.removeUser(req.user.id);
    return { ok: true };
  }

  // optional: get any user by id for testing (protected)
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getById(@Param('id') id: string) {
    const u = await this.usersService.findById(id);
    return sanitizeUser(u);
  }
}
