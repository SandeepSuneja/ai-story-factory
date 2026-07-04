import logging
import os
import re
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
IMAGE_WIDTH = int(os.environ.get("FLUX_IMAGE_WIDTH", "832"))
IMAGE_HEIGHT = int(os.environ.get("FLUX_IMAGE_HEIGHT", "480"))
FLUX_CLIP_MAX_TOKENS = int(os.environ.get("FLUX_CLIP_MAX_TOKENS", "77"))
FLUX_PROMPT_SUFFIX = os.environ.get(
    "FLUX_PROMPT_SUFFIX",
    "cinematic lighting, photorealistic",
)
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


def strip_flux_boilerplate(prompt: str) -> str:
    """Remove resolution/aspect tags that waste CLIP tokens without helping FLUX."""
    text = prompt.strip()
    text = re.sub(
        r"\b(horizontal\s*)?16\s*:\s*9\b[^.]*",
        "",
        text,
        flags=re.I,
    )
    text = re.sub(r"\b832\s*[x×]\s*480\b", "", text, flags=re.I)
    text = re.sub(
        r"\b(keyframe|frozen moment|single frame|photographable frame)\b",
        "",
        text,
        flags=re.I,
    )
    text = re.sub(r"\s+", " ", text).strip(" ,.-")
    return text


def clip_token_count(tokenizer, text: str) -> int:
    return len(tokenizer.encode(text, add_special_tokens=True, truncation=False))


def prepare_flux_prompt(prompt: str, pipeline: FluxPipeline) -> str:
    """Fit prompt into CLIP's 77-token limit; keep scene/subject at the start."""
    text = strip_flux_boilerplate(prompt)
    if not text:
        text = prompt.strip()

    tokenizer = pipeline.tokenizer
    suffix = FLUX_PROMPT_SUFFIX.strip()
    original_tokens = clip_token_count(tokenizer, text)

    suffix_tokens = clip_token_count(tokenizer, f"x, {suffix}") if suffix else 0
    text_budget = max(16, FLUX_CLIP_MAX_TOKENS - suffix_tokens)

    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
    selected: list[str] = []
    for sentence in sentences:
        candidate = " ".join(selected + [sentence])
        if clip_token_count(tokenizer, candidate) <= text_budget:
            selected.append(sentence)
        else:
            break

    if selected:
        compact = " ".join(selected)
    elif original_tokens <= text_budget:
        compact = text
    else:
        token_ids = tokenizer.encode(
            text,
            add_special_tokens=False,
            truncation=True,
            max_length=text_budget,
        )
        compact = tokenizer.decode(token_ids, skip_special_tokens=True).strip()

    result = f"{compact}, {suffix}" if suffix else compact
    if suffix and clip_token_count(tokenizer, result) > FLUX_CLIP_MAX_TOKENS:
        result = compact

    final_tokens = clip_token_count(tokenizer, result)
    if final_tokens > FLUX_CLIP_MAX_TOKENS:
        token_ids = tokenizer.encode(
            result,
            add_special_tokens=True,
            truncation=True,
            max_length=FLUX_CLIP_MAX_TOKENS,
        )
        result = tokenizer.decode(token_ids, skip_special_tokens=True).strip()
        final_tokens = clip_token_count(tokenizer, result)

    if final_tokens < original_tokens:
        logger.info(
            "CLIP prompt compressed from %s to %s tokens",
            original_tokens,
            final_tokens,
        )

    return result


class GenerateImageRequest(BaseModel):
    prompt: str = Field(min_length=1)
    scene_number: int = Field(ge=1)
    orientation: str = Field(default="landscape")
    width: int | None = Field(default=None, ge=256, le=2048)
    height: int | None = Field(default=None, ge=256, le=2048)


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
    width = request.width or (
        IMAGE_HEIGHT if request.orientation == "portrait" else IMAGE_WIDTH
    )
    height = request.height or (
        IMAGE_WIDTH if request.orientation == "portrait" else IMAGE_HEIGHT
    )

    try:
        flux_prompt = prepare_flux_prompt(request.prompt, pipe)
        with torch.inference_mode():
            result = pipe(
                flux_prompt,
                height=height,
                width=width,
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
