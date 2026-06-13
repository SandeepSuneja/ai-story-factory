import type { SceneScript } from "../content-state";
export declare class GenerateIdeaRequestDto {
    topic: string;
}
export declare class GenerateIdeaResponseDto {
    idea: string;
}
export declare class GenerateStoryRequestDto {
    idea: string;
}
export declare class GenerateStoryResponseDto {
    story: string;
}
export declare class GenerateScriptRequestDto {
    story: string;
}
export declare class GenerateScriptResponseDto {
    script: SceneScript[];
}
export declare class GenerateCharacterProfileRequestDto {
    story: string;
    script: SceneScript[];
}
export declare class GenerateCharacterProfileResponseDto {
    characterAppearance: string;
}
export declare class GeneratePromptRequestDto {
    scene: SceneScript;
    characterAppearance: string;
}
export declare class GeneratePromptResponseDto {
    scene: SceneScript;
}
export declare class GenerateImageRequestDto {
    scene: SceneScript;
}
export declare class GenerateImageResponseDto {
    scene: SceneScript;
}
