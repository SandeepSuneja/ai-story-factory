import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { FluxService } from './services/flux.service';
import { SdxlService } from './services/sdxl.service';
import { HunyuanService } from './services/hunyuan.service';
import { TtsService } from './services/tts.service';

const DEFAULT_PORT = 3000;
const LISTEN_RETRY_ATTEMPTS = 15;
const LISTEN_RETRY_DELAY_MS = 1000;

function resolvePort(): number {
  const raw = process.env.PORT?.trim();
  if (!raw) {
    return DEFAULT_PORT;
  }

  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${raw}`);
  }

  return port;
}

function isAddrInUse(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
  );
}

async function listenWithRetry(
  app: NestExpressApplication,
  port: number,
): Promise<void> {
  for (let attempt = 1; attempt <= LISTEN_RETRY_ATTEMPTS; attempt++) {
    try {
      await app.listen(port);
      return;
    } catch (error) {
      if (!isAddrInUse(error) || attempt === LISTEN_RETRY_ATTEMPTS) {
        if (isAddrInUse(error)) {
          console.error(
            `Port ${port} is already in use. Stop the other backend process ` +
              `(or wait for an in-flight video request to finish if \`start:dev\` ` +
              `just restarted), then run the server again.`,
          );
        }
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, LISTEN_RETRY_DELAY_MS));
    }
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const fluxService = app.get(FluxService);
  const sdxlService = app.get(SdxlService);
  const hunyuanService = app.get(HunyuanService);
  const ttsService = app.get(TtsService);

  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true });

  app.enableShutdownHooks();

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  app.useStaticAssets(fluxService.getStorageDirectory(), {
    prefix: '/images/',
  });

  app.useStaticAssets(sdxlService.getLoraStorageDirectory(), {
    prefix: '/loras/',
  });

  app.useStaticAssets(hunyuanService.getVideoStorageDirectory(), {
    prefix: '/videos/',
  });

  app.useStaticAssets(ttsService.getStorageDirectory(), {
    prefix: '/audio/',
  });

  await listenWithRetry(app, resolvePort());

  const server = app.getHttpServer();
  const longTimeoutMs = 48 * 60 * 60 * 1000;
  server.setTimeout(longTimeoutMs);
  server.headersTimeout = longTimeoutMs + 60_000;
  server.keepAliveTimeout = 120_000;
}
bootstrap();
