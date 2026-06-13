export declare class FluxService {
    private readonly serviceUrl;
    getStorageDirectory(): string;
    generateImage(prompt: string, sceneNumber: number): Promise<string>;
}
