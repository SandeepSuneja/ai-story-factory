from __future__ import annotations

import logging
import os
import re
import uuid
from pathlib import Path

import torch
import uvicorn
from diffusers import StableDiffusionXLImg2ImgPipeline, StableDiffusionXLPipeline
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel, Field

from train_lora import train_character_lora

MODEL_ID = os.environ.get("SDXL_MODEL_ID", "cagliostrolab/animagine-xl-3.1")
HOST = os.environ.get("SDXL_HOST", "127.0.0.1")
PORT = int(os.environ.get("SDXL_PORT", "7865"))
IMAGE_STORAGE_DIR = Path(
    os.environ.get(
        "IMAGE_STORAGE_DIR",
        str(Path(__file__).resolve().parent.parent / "storage" / "images"),
    )
)
LORA_STORAGE_DIR = Path(
    os.environ.get(
        "LORA_STORAGE_DIR",
        str(Path(__file__).resolve().parent.parent / "storage" / "loras"),
    )
)
NUM_INFERENCE_STEPS = int(os.environ.get("SDXL_INFERENCE_STEPS", "28"))
GUIDANCE_SCALE = float(os.environ.get("SDXL_GUIDANCE_SCALE", "7.0"))
IMAGE_WIDTH = int(os.environ.get("SDXL_IMAGE_WIDTH", "832"))
IMAGE_HEIGHT = int(os.environ.get("SDXL_IMAGE_HEIGHT", "480"))
IMG2IMG_STRENGTH = float(os.environ.get("SDXL_IMG2IMG_STRENGTH", "0.45"))
DEFAULT_LORA_SCALE = float(os.environ.get("SDXL_LORA_DEFAULT_SCALE", "0.85"))
TRAIN_RESOLUTION = int(os.environ.get("SDXL_LORA_TRAIN_RESOLUTION", "768"))
TRAIN_STEPS = int(os.environ.get("SDXL_LORA_TRAIN_STEPS", "400"))
TRAIN_RANK = int(os.environ.get("SDXL_LORA_RANK", "8"))
TRAIN_LR = float(os.environ.get("SDXL_LORA_LEARNING_RATE", "1e-4"))
OFFLOAD_MODE = os.environ.get("SDXL_OFFLOAD_MODE", "sequential")
DEFAULT_NEGATIVE_PROMPT = os.environ.get(
    "SDXL_NEGATIVE_PROMPT",
    (
        "duplicate person, twin, clone, same face twice, mirrored character, "
        "identical twins, extra person, deformed face, blurry, low quality"
    ),
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="SDXL Scene Service")
pipe: StableDiffusionXLPipeline | None = None
img2img_pipe: StableDiffusionXLImg2ImgPipeline | None = None
loaded_loras: set[str] = set()


def resolve_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def configure_pipeline_memory(pipeline, device: str) -> str:
    if device == "cuda":
        pipeline.enable_vae_slicing()
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


def reset_pipelines() -> None:
    """Drop cached pipelines after InferenceMode poisons LoRA adapter tensors."""
    global pipe, img2img_pipe, loaded_loras
    pipe = None
    img2img_pipe = None
    loaded_loras = set()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def ensure_pipeline() -> StableDiffusionXLPipeline:
    global pipe
    if pipe is not None:
        return pipe

    device = resolve_device()
    dtype = torch.float16 if device == "cuda" else torch.float32
    logger.info("Loading SDXL pipeline %s on %s", MODEL_ID, device)
    pipe = StableDiffusionXLPipeline.from_pretrained(
        MODEL_ID,
        torch_dtype=dtype,
        use_safetensors=True,
    )
    configure_pipeline_memory(pipe, device)
    return pipe


def ensure_img2img_pipeline() -> StableDiffusionXLImg2ImgPipeline:
    global img2img_pipe
    if img2img_pipe is not None:
        return img2img_pipe

    base = ensure_pipeline()
    img2img_pipe = StableDiffusionXLImg2ImgPipeline.from_pipe(base)
    return img2img_pipe


def _is_inference_tensor_error(error: BaseException) -> bool:
    message = str(error)
    return "InferenceMode" in message or "requires_grad" in message


def prepare_pipeline_with_loras(
    *,
    img2img: bool,
    lora_specs: list["LoraSpec"],
) -> StableDiffusionXLPipeline | StableDiffusionXLImg2ImgPipeline:
    pipeline = ensure_img2img_pipeline() if img2img else ensure_pipeline()
    try:
        apply_loras(pipeline, lora_specs)
        return pipeline
    except RuntimeError as error:
        if not _is_inference_tensor_error(error):
            raise
        logger.warning(
            "LoRA adapters poisoned by InferenceMode; reloading SDXL pipeline"
        )
        reset_pipelines()
        pipeline = ensure_img2img_pipeline() if img2img else ensure_pipeline()
        apply_loras(pipeline, lora_specs)
        return pipeline


def resolve_storage_path(raw_path: str, storage_dir: Path) -> Path | None:
    normalized = raw_path.strip().replace("\\", "/")
    if not normalized:
        return None

    if normalized.startswith("/images/"):
        return storage_dir / normalized[len("/images/") :]
    if normalized.startswith("/loras/"):
        return LORA_STORAGE_DIR / normalized[len("/loras/") :]

    filename = Path(normalized).name
    candidate = storage_dir / filename
    if candidate.is_file():
        return candidate
    lora_candidate = LORA_STORAGE_DIR / filename
    if lora_candidate.is_file():
        return lora_candidate
    return None


def resolve_image_path(raw_path: str) -> Path | None:
    return resolve_storage_path(raw_path, IMAGE_STORAGE_DIR)


def resolve_lora_path(raw_path: str) -> Path | None:
    return resolve_storage_path(raw_path, LORA_STORAGE_DIR)


def sanitize_filename_prefix(prefix: str | None) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", (prefix or "").lower()).strip("-")


def resolve_generator(seed: int | None, device: str) -> torch.Generator | None:
    if seed is None:
        return None
    generator = torch.Generator(device=device if device != "mps" else "cpu")
    generator.manual_seed(seed)
    return generator


def apply_loras(
    pipeline: StableDiffusionXLPipeline | StableDiffusionXLImg2ImgPipeline,
    lora_specs: list["LoraSpec"],
) -> None:
    global loaded_loras

    if not lora_specs:
        if hasattr(pipeline, "set_adapters"):
            try:
                pipeline.set_adapters([])
            except Exception:
                pass
        return

    adapter_names: list[str] = []
    adapter_weights: list[float] = []

    for spec in lora_specs:
        lora_path = resolve_lora_path(spec.lora_path)
        if lora_path is None or not lora_path.is_file():
            logger.warning("LoRA not found: %s", spec.lora_path)
            continue

        adapter_name = spec.adapter_name or lora_path.stem
        cache_key = f"{adapter_name}:{lora_path}"
        if cache_key not in loaded_loras:
            pipeline.load_lora_weights(str(lora_path.parent), weight_name=lora_path.name, adapter_name=adapter_name)
            loaded_loras.add(cache_key)
        adapter_names.append(adapter_name)
        adapter_weights.append(spec.scale if spec.scale is not None else DEFAULT_LORA_SCALE)

    if adapter_names:
        pipeline.set_adapters(adapter_names, adapter_weights=adapter_weights)


class LoraSpec(BaseModel):
    lora_path: str = Field(min_length=1)
    adapter_name: str | None = Field(default=None, min_length=1, max_length=80)
    scale: float | None = Field(default=None, ge=0.0, le=2.0)


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1)
    scene_number: int = Field(ge=1)
    orientation: str = Field(default="landscape")
    width: int | None = Field(default=None, ge=256, le=2048)
    height: int | None = Field(default=None, ge=256, le=2048)
    seed: int | None = Field(default=None, ge=0)
    filename_prefix: str | None = Field(default=None, min_length=1, max_length=80)
    negative_prompt: str | None = Field(default=None, max_length=2000)
    loras: list[LoraSpec] = Field(default_factory=list)


class GenerateFromImageRequest(BaseModel):
    prompt: str = Field(min_length=1)
    source_image_path: str = Field(min_length=1)
    scene_number: int = Field(ge=1)
    orientation: str = Field(default="landscape")
    width: int | None = Field(default=None, ge=256, le=2048)
    height: int | None = Field(default=None, ge=256, le=2048)
    seed: int | None = Field(default=None, ge=0)
    strength: float | None = Field(default=None, ge=0.05, le=0.95)
    filename_prefix: str | None = Field(default=None, min_length=1, max_length=80)
    negative_prompt: str | None = Field(default=None, max_length=2000)
    loras: list[LoraSpec] = Field(default_factory=list)


class TrainLoraRequest(BaseModel):
    character_id: str = Field(min_length=1, max_length=80)
    portrait_image_path: str = Field(min_length=1)
    instance_prompt: str = Field(min_length=1)
    appearance: str = Field(min_length=1)


class GenerateImageResponse(BaseModel):
    filename: str
    imagePath: str


class TrainLoraResponse(BaseModel):
    loraPath: str
    metaPath: str
    characterId: str


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "model": MODEL_ID,
        "device": resolve_device(),
    }


@app.post("/generate", response_model=GenerateImageResponse)
def generate(request: GenerateRequest) -> GenerateImageResponse:
    # Use no_grad (not inference_mode): inference_mode permanently marks LoRA
    # adapter tensors, so the next set_adapters() crashes on regenerate.
    pipeline = prepare_pipeline_with_loras(img2img=False, lora_specs=request.loras)

    width = request.width or (
        IMAGE_HEIGHT if request.orientation == "portrait" else IMAGE_WIDTH
    )
    height = request.height or (
        IMAGE_WIDTH if request.orientation == "portrait" else IMAGE_HEIGHT
    )

    prefix = sanitize_filename_prefix(request.filename_prefix)
    filename = (
        f"{prefix}.png"
        if prefix
        else f"scene-{request.scene_number}-{uuid.uuid4().hex}.png"
    )
    output_path = IMAGE_STORAGE_DIR / filename
    IMAGE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    device = resolve_device()
    generator = resolve_generator(request.seed, device)
    negative_prompt = (request.negative_prompt or DEFAULT_NEGATIVE_PROMPT).strip()
    pipe_kwargs: dict = {
        "prompt": request.prompt,
        "negative_prompt": negative_prompt or None,
        "width": width,
        "height": height,
        "guidance_scale": GUIDANCE_SCALE,
        "num_inference_steps": NUM_INFERENCE_STEPS,
    }
    if generator is not None:
        pipe_kwargs["generator"] = generator

    try:
        with torch.no_grad():
            result = pipeline(**pipe_kwargs)
        result.images[0].save(output_path)
    finally:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    logger.info("SDXL scene %s -> %s (%s LoRAs)", request.scene_number, filename, len(request.loras))
    return GenerateImageResponse(filename=filename, imagePath=f"/images/{filename}")


@app.post("/generate-from-image", response_model=GenerateImageResponse)
def generate_from_image(request: GenerateFromImageRequest) -> GenerateImageResponse:
    pipeline = prepare_pipeline_with_loras(img2img=True, lora_specs=request.loras)

    source_path = resolve_image_path(request.source_image_path)
    if source_path is None or not source_path.is_file():
        raise HTTPException(status_code=400, detail="Source image not found")

    width = request.width or (
        IMAGE_HEIGHT if request.orientation == "portrait" else IMAGE_WIDTH
    )
    height = request.height or (
        IMAGE_WIDTH if request.orientation == "portrait" else IMAGE_HEIGHT
    )

    prefix = sanitize_filename_prefix(request.filename_prefix)
    filename = (
        f"{prefix}.png"
        if prefix
        else f"scene-{request.scene_number}-{uuid.uuid4().hex}.png"
    )
    output_path = IMAGE_STORAGE_DIR / filename
    IMAGE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    with Image.open(source_path) as source_image:
        source = source_image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)

    device = resolve_device()
    generator = resolve_generator(request.seed, device)
    negative_prompt = (request.negative_prompt or DEFAULT_NEGATIVE_PROMPT).strip()
    pipe_kwargs: dict = {
        "prompt": request.prompt,
        "negative_prompt": negative_prompt or None,
        "image": source,
        "strength": request.strength if request.strength is not None else IMG2IMG_STRENGTH,
        "guidance_scale": GUIDANCE_SCALE,
        "num_inference_steps": NUM_INFERENCE_STEPS,
    }
    if generator is not None:
        pipe_kwargs["generator"] = generator

    try:
        with torch.no_grad():
            result = pipeline(**pipe_kwargs)
        result.images[0].save(output_path)
    finally:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    logger.info(
        "SDXL img2img scene %s from %s -> %s",
        request.scene_number,
        request.source_image_path,
        filename,
    )
    return GenerateImageResponse(filename=filename, imagePath=f"/images/{filename}")


@app.post("/train-lora", response_model=TrainLoraResponse)
def train_lora(request: TrainLoraRequest) -> TrainLoraResponse:
    portrait_path = resolve_image_path(request.portrait_image_path)
    if portrait_path is None or not portrait_path.is_file():
        raise HTTPException(status_code=400, detail="Portrait image not found")

    LORA_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    lora_filename = f"character-{request.character_id}.safetensors"
    lora_path = LORA_STORAGE_DIR / lora_filename
    meta_path = LORA_STORAGE_DIR / f"character-{request.character_id}.lora.meta.json"

    try:
        train_character_lora(
            model_id=MODEL_ID,
            portrait_path=portrait_path,
            output_path=lora_path,
            meta_path=meta_path,
            character_id=request.character_id,
            instance_prompt=request.instance_prompt,
            appearance=request.appearance,
            train_resolution=TRAIN_RESOLUTION,
            train_steps=TRAIN_STEPS,
            train_rank=TRAIN_RANK,
            train_lr=TRAIN_LR,
            default_scale=DEFAULT_LORA_SCALE,
            device=resolve_device(),
        )
    except Exception as error:
        logger.exception("LoRA training failed for %s", request.character_id)
        raise HTTPException(status_code=500, detail=str(error)) from error

    return TrainLoraResponse(
        loraPath=f"/loras/{lora_filename}",
        metaPath=f"/loras/character-{request.character_id}.lora.meta.json",
        characterId=request.character_id,
    )


if __name__ == "__main__":
    IMAGE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    LORA_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    uvicorn.run(app, host=HOST, port=PORT)
