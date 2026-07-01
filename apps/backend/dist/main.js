"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const flux_service_1 = require("./services/flux.service");
const hunyuan_service_1 = require("./services/hunyuan.service");
const tts_service_1 = require("./services/tts.service");
const DEFAULT_PORT = 3000;
const LISTEN_RETRY_ATTEMPTS = 15;
const LISTEN_RETRY_DELAY_MS = 1000;
function resolvePort() {
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
function isAddrInUse(error) {
    return (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'EADDRINUSE');
}
async function listenWithRetry(app, port) {
    for (let attempt = 1; attempt <= LISTEN_RETRY_ATTEMPTS; attempt++) {
        try {
            await app.listen(port);
            return;
        }
        catch (error) {
            if (!isAddrInUse(error) || attempt === LISTEN_RETRY_ATTEMPTS) {
                if (isAddrInUse(error)) {
                    console.error(`Port ${port} is already in use. Stop the other backend process ` +
                        `(or wait for an in-flight video request to finish if \`start:dev\` ` +
                        `just restarted), then run the server again.`);
                }
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, LISTEN_RETRY_DELAY_MS));
        }
    }
}
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const fluxService = app.get(flux_service_1.FluxService);
    const hunyuanService = app.get(hunyuan_service_1.HunyuanService);
    const ttsService = app.get(tts_service_1.TtsService);
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
    app.useStaticAssets(hunyuanService.getVideoStorageDirectory(), {
        prefix: '/videos/',
    });
    app.useStaticAssets(ttsService.getStorageDirectory(), {
        prefix: '/audio/',
    });
    await listenWithRetry(app, resolvePort());
}
bootstrap();
//# sourceMappingURL=main.js.map