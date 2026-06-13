"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const flux_service_1 = require("./services/flux.service");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const fluxService = app.get(flux_service_1.FluxService);
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
//# sourceMappingURL=main.js.map