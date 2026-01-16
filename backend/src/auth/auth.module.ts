import { Module, forwardRef } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { UsersController } from '../users/users.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Session, SessionSchema } from '../sessions/sessions.schema';
import { SessionsService } from '../sessions/sessions.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MailModule } from '../mail/mail.module';
import { EmailMetadata, EmailMetadataSchema } from '../mail/schemas/email-metadata.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema }, 
      { name: Session.name, schema: SessionSchema },
      { name: EmailMetadata.name, schema: EmailMetadataSchema }
    ]),
    forwardRef(() => MailModule), // Import MailModule for SemanticSearchService
  ],
  controllers: [AuthController, UsersController],
  providers: [AuthService, UsersService, JwtAuthGuard, SessionsService],
  exports: [AuthService, JwtAuthGuard, UsersService, SessionsService],
})
export class AuthModule {}
