import { AppService } from './app.service';
import { GenerateCharacterProfileRequestDto, GenerateCharacterProfileResponseDto, GenerateIdeaRequestDto, GenerateIdeaResponseDto, GenerateImageRequestDto, GenerateImageResponseDto, GeneratePromptRequestDto, GeneratePromptResponseDto, GenerateScriptRequestDto, GenerateScriptResponseDto, GenerateStoryRequestDto, GenerateStoryResponseDto, GenerateVideoRequestDto, GenerateVideoResponseDto, GenerateAudioRequestDto, GenerateAudioResponseDto, AssembleVideoRequestDto, AssembleVideoResponseDto } from './models/content.model';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    getHello(): string;
    generateIdea(body: GenerateIdeaRequestDto): Promise<GenerateIdeaResponseDto>;
    generateStory(body: GenerateStoryRequestDto): Promise<GenerateStoryResponseDto>;
    generateScript(body: GenerateScriptRequestDto): Promise<GenerateScriptResponseDto>;
    generateCharacterProfile(body: GenerateCharacterProfileRequestDto): Promise<GenerateCharacterProfileResponseDto>;
    generatePrompt(body: GeneratePromptRequestDto): Promise<GeneratePromptResponseDto>;
    generateImage(body: GenerateImageRequestDto): Promise<GenerateImageResponseDto>;
    generateVideo(body: GenerateVideoRequestDto): Promise<GenerateVideoResponseDto>;
    generateAudio(body: GenerateAudioRequestDto): Promise<GenerateAudioResponseDto>;
    assembleVideo(body: AssembleVideoRequestDto): Promise<AssembleVideoResponseDto>;
}
