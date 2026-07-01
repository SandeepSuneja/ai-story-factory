import logging
import os
import re
import uuid
from pathlib import Path

import torch
import uvicorn
from diffusers import CogVideoXImageToVideoPipeline
from diffusers.utils import export_to_video, load_image
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODEL_ID = os.environ.get("HUNYUAN_MODEL_ID", "THUDM/CogVideoX-5b-I2V")
HOST = os.environ.get("HUNYUAN_HOST", "127.0.0.1")
PORT = int(os.environ.get("HUNYUAN_PORT", "7861"))
IMAGE_DIR = Path(
    os.environ.get(
        "IMAGE_STORAGE_DIR",
        str(Path(__file__).resolve().parent.parent / "storage" / "images"),
    )
)
VIDEO_DIR = Path(
    os.environ.get(
        "VIDEO_STORAGE_DIR",
        str(Path(__file__).resolve().parent.parent / "storage" / "videos"),
    )
)
NUM_INFERENCE_STEPS = int(os.environ.get("HUNYUAN_INFERENCE_STEPS", "40"))
DEFAULT_NUM_FRAMES = int(os.environ.get("HUNYUAN_NUM_FRAMES", "49"))
FPS = int(os.environ.get("HUNYUAN_FPS", "8"))
MAX_NUM_FRAMES = int(os.environ.get("HUNYUAN_MAX_NUM_FRAMES", "49"))
MIN_NUM_FRAMES = int(os.environ.get("HUNYUAN_MIN_NUM_FRAMES", "49"))
MAX_SCENE_DURATION_SECONDS = int(os.environ.get("HUNYUAN_MAX_SCENE_DURATION", "6"))
# CogVideoX-5b-I2V only supports its trained resolution (720x480 landscape).
VIDEO_WIDTH = int(os.environ.get("HUNYUAN_VIDEO_WIDTH", "720"))
VIDEO_HEIGHT = int(os.environ.get("HUNYUAN_VIDEO_HEIGHT", "480"))
GUIDANCE_SCALE = float(os.environ.get("HUNYUAN_GUIDANCE_SCALE", "6.0"))
MAX_SEQUENCE_LENGTH = int(os.environ.get("HUNYUAN_MAX_SEQUENCE_LENGTH", "226"))
MAX_PROMPT_TOKENS = int(os.environ.get("HUNYUAN_MAX_PROMPT_TOKENS", "226"))
NEGATIVE_PROMPT = os.environ.get(
    "HUNYUAN_NEGATIVE_PROMPT",
    "worst quality, inconsistent motion, blurry, jittery, distorted, low resolution, shaky camera",
)
# auto | model | sequential | full
# auto picks model offload on <=20 GB VRAM (fits ~11 GB with VAE tiling on RTX 4070).
OFFLOAD_MODE = os.environ.get("HUNYUAN_OFFLOAD_MODE", "auto")
COGVIDEO_FRAME_STRIDE = 4
MOTION_KEYWORDS = (
    "camera",
    "pan",
    "dolly",
    "zoom",
    "track",
    "crane",
    "motion",
    "move",
    "walk",
    "turn",
    "wind",
    "rain",
    "light",
    "glow",
    "fade",
    "drift",
    "slow",
    "gentle",
    "cinematic",
    "atmosphere",
    "mood",
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="CogVideoX Service")
pipe: CogVideoXImageToVideoPipeline | None = None
output_width = VIDEO_WIDTH
output_height = VIDEO_HEIGHT


def resolve_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def detect_vram_gb() -> float | None:
    if not torch.cuda.is_available():
        return None
    _, total_bytes = torch.cuda.mem_get_info()
    return total_bytes / (1024**3)


def resolve_memory_mode(vram_gb: float | None) -> str:
    if OFFLOAD_MODE != "auto":
        return OFFLOAD_MODE
    if vram_gb is None:
        return "model"
    if vram_gb >= 20:
        return "full"
    return "model"


def log_cuda_memory(label: str) -> None:
    if not torch.cuda.is_available():
        return

    free_bytes, total_bytes = torch.cuda.mem_get_info()
    logger.info(
        "%s: %d MB free / %d MB total VRAM",
        label,
        free_bytes // (1024 * 1024),
        total_bytes // (1024 * 1024),
    )


def round_to_valid_cogvideo_frames(frames: int) -> int:
    """CogVideoX VAE requires num_frames divisible by temporal_compression_ratio (4)."""
    if frames <= COGVIDEO_FRAME_STRIDE:
        return COGVIDEO_FRAME_STRIDE
    return max(
        COGVIDEO_FRAME_STRIDE,
        ((frames + COGVIDEO_FRAME_STRIDE - 1) // COGVIDEO_FRAME_STRIDE)
        * COGVIDEO_FRAME_STRIDE,
    )


def clamp_num_frames(duration_seconds: int | None) -> int:
    if duration_seconds is not None:
        duration_seconds = max(1, min(MAX_SCENE_DURATION_SECONDS, duration_seconds))

    if MIN_NUM_FRAMES == MAX_NUM_FRAMES:
        return MIN_NUM_FRAMES

    if duration_seconds is None:
        target = DEFAULT_NUM_FRAMES
    else:
        target = duration_seconds * FPS

    target = round_to_valid_cogvideo_frames(target)
    clamped = max(MIN_NUM_FRAMES, min(MAX_NUM_FRAMES, target))
    clamped = round_to_valid_cogvideo_frames(clamped)

    if duration_seconds is not None and target != clamped:
        logger.info(
            "Capped scene duration %ss (%s frames) to %s frames",
            duration_seconds,
            target,
            clamped,
        )
    return clamped


def strip_character_boilerplate(prompt: str) -> str:
    """Drop repeated character sheets; I2V already conditions on the scene image."""
    text = prompt.strip()
    for marker in (
        r"\*\*Character:\*\*",
        r"Character appearance:",
        r"Character:",
        r"Use the exact character appearance",
    ):
        text = re.sub(marker + r".*?(?=\*\*Scene:\*\*|Scene:|$)", "", text, flags=re.I | re.S)
    text = re.sub(r"\*\*Scene:\*\*", "", text, flags=re.I)
    text = re.sub(r"\*\*Mood:\*\*", "Mood:", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip(" ,.-")
    return text


def score_motion_sentence(sentence: str) -> int:
    lowered = sentence.lower()
    return sum(1 for keyword in MOTION_KEYWORDS if keyword in lowered)


def prepare_cogvideo_prompt(
    prompt: str,
    pipeline: CogVideoXImageToVideoPipeline,
    max_tokens: int = MAX_PROMPT_TOKENS,
) -> str:
    """Fit prompt into CogVideoX T5 limit, keeping motion/action over boilerplate."""
    text = strip_character_boilerplate(prompt)
    if not text:
        text = prompt.strip()

    tokenizer = pipeline.tokenizer
    token_ids = tokenizer.encode(text, add_special_tokens=False)
    if len(token_ids) <= max_tokens:
        return text

    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
    if sentences:
        ranked = sorted(
            sentences,
            key=lambda sentence: (score_motion_sentence(sentence), len(sentence)),
            reverse=True,
        )
        selected: list[str] = []
        for sentence in ranked:
            candidate = " ".join(selected + [sentence])
            if len(tokenizer.encode(candidate, add_special_tokens=False)) <= max_tokens:
                selected.append(sentence)
        if selected:
            compact = " ".join(selected)
            if len(tokenizer.encode(compact, add_special_tokens=False)) <= max_tokens:
                logger.info(
                    "Compressed prompt from %s to %s tokens (motion-focused)",
                    len(token_ids),
                    len(tokenizer.encode(compact, add_special_tokens=False)),
                )
                return compact

    tail_ids = token_ids[-max_tokens:]
    compact = tokenizer.decode(tail_ids, skip_special_tokens=True).strip()
    logger.info(
        "Trimmed prompt from %s to %s tokens (kept tail with action/motion)",
        len(token_ids),
        max_tokens,
    )
    return compact


def resolve_output_size(pipeline: CogVideoXImageToVideoPipeline) -> tuple[int, int]:
    """Return pixel width/height; learned-pos-embed models ignore custom sizes."""
    scale = pipeline.vae_scale_factor_spatial
    model_width = pipeline.transformer.config.sample_width * scale
    model_height = pipeline.transformer.config.sample_height * scale
    use_learned_pos = getattr(
        pipeline.transformer.config,
        "use_learned_positional_embeddings",
        False,
    )

    if use_learned_pos:
        if VIDEO_WIDTH != model_width or VIDEO_HEIGHT != model_height:
            logger.warning(
                "%s only supports %sx%s; ignoring HUNYUAN_VIDEO_WIDTH/HEIGHT=%sx%s",
                MODEL_ID,
                model_width,
                model_height,
                VIDEO_WIDTH,
                VIDEO_HEIGHT,
            )
        return model_width, model_height

    return VIDEO_WIDTH, VIDEO_HEIGHT


def configure_vae_memory(pipeline: CogVideoXImageToVideoPipeline) -> None:
    if pipeline.vae is None:
        return
    pipeline.vae.enable_tiling()
    if hasattr(pipeline.vae, "enable_slicing"):
        pipeline.vae.enable_slicing()


def load_pipeline(
    device: str,
    dtype: torch.dtype,
    memory_mode: str,
) -> CogVideoXImageToVideoPipeline:
    pipeline = CogVideoXImageToVideoPipeline.from_pretrained(
        MODEL_ID,
        torch_dtype=dtype,
        low_cpu_mem_usage=True,
    )

    if device == "cuda":
        configure_vae_memory(pipeline)
        if memory_mode == "sequential":
            pipeline.enable_sequential_cpu_offload()
        elif memory_mode == "model":
            pipeline.enable_model_cpu_offload()
        elif memory_mode == "full":
            pipeline.to("cuda")
        else:
            raise ValueError(f"Unknown HUNYUAN_OFFLOAD_MODE: {memory_mode}")
        return pipeline

    if device == "mps":
        pipeline.to("mps")
        return pipeline

    pipeline.to("cpu")
    return pipeline


def describe_memory_mode(memory_mode: str, device: str) -> str:
    if device != "cuda":
        return device
    labels = {
        "sequential": "cuda (sequential cpu offload)",
        "model": "cuda (model cpu offload + VAE tiling)",
        "full": "cuda (full VRAM)",
    }
    return labels.get(memory_mode, f"cuda ({memory_mode})")


class GenerateVideoRequest(BaseModel):
    prompt: str = Field(min_length=1)
    scene_number: int = Field(ge=1)
    image_filename: str = Field(min_length=1)
    duration_seconds: int | None = Field(default=None, ge=1, le=30)


class GenerateVideoResponse(BaseModel):
    filename: str
    videoPath: str


@app.on_event("startup")
def load_model() -> None:
    global pipe, output_width, output_height

    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    device = resolve_device()
    dtype = torch.bfloat16 if device != "cpu" else torch.float32
    vram_gb = detect_vram_gb()
    memory_mode = resolve_memory_mode(vram_gb)

    logger.info(
        "Loading CogVideoX pipeline %s on %s (VRAM=%s GB, mode=%s)",
        MODEL_ID,
        device,
        f"{vram_gb:.1f}" if vram_gb is not None else "n/a",
        memory_mode,
    )
    pipe = load_pipeline(device, dtype, memory_mode)
    output_width, output_height = resolve_output_size(pipe)
    mode_label = describe_memory_mode(memory_mode, device)

    logger.info(
        "CogVideoX pipeline ready mode=%s dtype=%s size=%sx%s fps=%s",
        mode_label,
        dtype,
        output_width,
        output_height,
        FPS,
    )
    log_cuda_memory("VRAM after model load")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_ID}


@app.post("/generate", response_model=GenerateVideoResponse)
def generate_video(request: GenerateVideoRequest) -> GenerateVideoResponse:
    if pipe is None:
        raise HTTPException(
            status_code=503,
            detail="CogVideoX pipeline is not ready",
        )

    image_path = IMAGE_DIR / request.image_filename
    if not image_path.is_file():
        raise HTTPException(
            status_code=400,
            detail=f"Image not found: {request.image_filename}",
        )

    filename = f"scene-{request.scene_number}-{uuid.uuid4().hex}.mp4"
    output_path = VIDEO_DIR / filename
    num_frames = clamp_num_frames(request.duration_seconds)

    try:
        image = load_image(str(image_path))
        motion_prompt = prepare_cogvideo_prompt(request.prompt, pipe)
        logger.info(
            "Generating scene %s (%sx%s, %s frames, %s steps, guidance=%s)",
            request.scene_number,
            output_width,
            output_height,
            num_frames,
            NUM_INFERENCE_STEPS,
            GUIDANCE_SCALE,
        )
        logger.info("Motion prompt: %s", motion_prompt[:240])
        log_cuda_memory("VRAM before generate")
        with torch.inference_mode():
            result = pipe(
                image=image,
                prompt=motion_prompt,
                negative_prompt=NEGATIVE_PROMPT,
                width=output_width,
                height=output_height,
                num_frames=num_frames,
                num_inference_steps=NUM_INFERENCE_STEPS,
                guidance_scale=GUIDANCE_SCALE,
                max_sequence_length=MAX_SEQUENCE_LENGTH,
            )
        export_to_video(result.frames[0], str(output_path), fps=FPS)
    except Exception as exc:
        logger.exception(
            "Video generation failed for scene %s",
            request.scene_number,
        )
        if output_path.exists():
            output_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    return GenerateVideoResponse(
        filename=filename,
        videoPath=f"/videos/{filename}",
    )


if __name__ == "__main__":
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)
