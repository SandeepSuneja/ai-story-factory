import { AppService } from './app.service';
import { GenerateContentRequestDto, GenerateContentResponseDto } from './models/content.model';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    getHello(): string;
    generate(body: GenerateContentRequestDto): Promise<GenerateContentResponseDto>;
}
