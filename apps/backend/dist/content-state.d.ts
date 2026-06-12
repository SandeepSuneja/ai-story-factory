export interface ContentState {
    topic: string;
    idea?: string;
    story?: string;
    script?: SceneScript[];
}
export interface SceneScript {
    sceneNumber: number;
    narration: string;
    visualDescription: string;
    duration: number;
    imagePrompt?: string;
    videoPrompt?: string;
    imagePath?: string;
    videoPath?: string;
    audioPath?: string;
}
