import type { SceneScript } from "../content-state";
import { FluxService } from "../services/flux.service";
export declare class ImageAgent {
    private readonly flux;
    constructor(flux: FluxService);
    execute(scene: SceneScript): Promise<SceneScript>;
}
