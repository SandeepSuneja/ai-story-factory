import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { FluxService } from './services/flux.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const fluxService = app.get(FluxService);

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    methods: ['GET', 'POST'],
  });

  app.useStaticAssets(fluxService.getStorageDirectory(), {
    prefix: '/images/',
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
