import logging
import os
import uuid
from pathlib import Path

import torch
import uvicorn
from diffusers import FluxPipeline
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODEL_ID = os.environ.get("FLUX_MODEL_ID", "black-forest-labs/FLUX.1-dev")
HOST = os.environ.get("FLUX_HOST", "127.0.0.1")
PORT = int(os.environ.get("FLUX_PORT", "7860"))
STORAGE_DIR = Path(
    os.environ.get(
        "IMAGE_STORAGE_DIR",
        str(Path(__file__).resolve().parent.parent / "storage" / "images"),
    )
)
NUM_INFERENCE_STEPS = int(os.environ.get("FLUX_INFERENCE_STEPS", "28"))
GUIDANCE_SCALE = float(os.environ.get("FLUX_GUIDANCE_SCALE", "3.5"))
IMAGE_WIDTH = int(os.environ.get("FLUX_IMAGE_WIDTH", "576"))
IMAGE_HEIGHT = int(os.environ.get("FLUX_IMAGE_HEIGHT", "1024"))
# full = all weights on GPU (needs ~24GB VRAM)
# model = move one component at a time (good for 16GB)
# sequential = submodule-level offload (safest for 12GB)
OFFLOAD_MODE = os.environ.get("FLUX_OFFLOAD_MODE", "sequential")

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="FLUX Image Service")
pipe: FluxPipeline | None = None


def resolve_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def configure_pipeline_memory(pipeline: FluxPipeline, device: str) -> str:
    if device == "cuda":
        pipeline.enable_vae_slicing()
        pipeline.enable_vae_tiling()

        if OFFLOAD_MODE == "full":
            pipeline.to("cuda")
            return "cuda (full)"

        if OFFLOAD_MODE == "model":
            pipeline.enable_model_cpu_offload()
            return "cuda (model cpu offload)"

        pipeline.enable_sequential_cpu_offload()
        return "cuda (sequential cpu offload)"

    if device == "mps":
        pipeline.to("mps")
        return "mps"

    pipeline.to("cpu")
    pipeline.enable_attention_slicing()
    return "cpu"


class GenerateImageRequest(BaseModel):
    prompt: str = Field(min_length=1)
    scene_number: int = Field(ge=1)


class GenerateImageResponse(BaseModel):
    filename: str
    imagePath: str


@app.on_event("startup")
def load_model() -> None:
    global pipe

    STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    device = resolve_device()
    dtype = torch.bfloat16 if device != "cpu" else torch.float32
    pipe = FluxPipeline.from_pretrained(
        MODEL_ID,
        torch_dtype=dtype,
        low_cpu_mem_usage=True,
    )
    memory_mode = configure_pipeline_memory(pipe, device)

    logger.info(
        "FLUX pipeline loaded mode=%s dtype=%s size=%sx%s",
        memory_mode,
        dtype,
        IMAGE_WIDTH,
        IMAGE_HEIGHT,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_ID}


@app.post("/generate", response_model=GenerateImageResponse)
def generate_image(request: GenerateImageRequest) -> GenerateImageResponse:
    if pipe is None:
        raise HTTPException(status_code=503, detail="FLUX pipeline is not ready")

    filename = f"scene-{request.scene_number}-{uuid.uuid4().hex}.png"
    output_path = STORAGE_DIR / filename

    try:
        with torch.inference_mode():
            result = pipe(
                request.prompt,
                height=IMAGE_HEIGHT,
                width=IMAGE_WIDTH,
                guidance_scale=GUIDANCE_SCALE,
                num_inference_steps=NUM_INFERENCE_STEPS,
            )
        image = result.images[0]
        image.save(output_path)
    finally:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    return GenerateImageResponse(
        filename=filename,
        imagePath=f"/images/{filename}",
    )


if __name__ == "__main__":
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)
