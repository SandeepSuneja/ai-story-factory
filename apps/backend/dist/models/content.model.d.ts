import type { SceneScript } from "../content-state";
export declare class GenerateContentRequestDto {
    topic: string;
}
export declare class GenerateContentResponseDto {
    idea: string;
    story: string;
    script: SceneScript[];
}
