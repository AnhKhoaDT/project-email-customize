import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import mongoose from 'mongoose';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
  const env = process.env.NODE_ENV || 'development';

  // Enable CORS and cookie parsing. Allow credentials so browser can send/receive cookies.
  app.use(cookieParser());
  const origin = process.env.FE_URL || 'http://localhost:3000';
  app.enableCors({ origin, credentials: true });
  
  await app.listen(port);
  console.log(`Backend listening on http://localhost:${port} (NODE_ENV=${env})`);
}

bootstrap();
