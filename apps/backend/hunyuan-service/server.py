import gc
import logging
import os
import re
import threading
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

import torch
import uvicorn
from diffusers import AutoencoderKLWan, UniPCMultistepScheduler, WanImageToVideoPipeline, WanTransformer3DModel
from diffusers.utils import export_to_video, load_image
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from huggingface_hub import hf_hub_download
from transformers import CLIPImageProcessor, CLIPVisionModelWithProjection, T5TokenizerFast, UMT5EncoderModel

BASE_MODEL_ID = os.environ.get("HUNYUAN_BASE_MODEL_ID") or os.environ.get(
    "HUNYUAN_MODEL_ID",
    "Wan-AI/Wan2.1-I2V-14B-480P-Diffusers",
)
MODEL_PRECISION = os.environ.get("HUNYUAN_PRECISION", "fp8").lower()
FP8_TRANSFORMER_REPO = os.environ.get(
    "HUNYUAN_FP8_TRANSFORMER_REPO",
    "wangkanai/wan21-fp8-480p",
)
FP8_TRANSFORMER_FILE = os.environ.get(
    "HUNYUAN_FP8_TRANSFORMER_FILE",
    "diffusion_models/wan/wan21-i2v-480p-14b-fp8-e4m3fn.safetensors",
)
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
NUM_INFERENCE_STEPS = int(os.environ.get("HUNYUAN_INFERENCE_STEPS", "0"))
DEFAULT_NUM_FRAMES = int(os.environ.get("HUNYUAN_NUM_FRAMES", "81"))
FPS = int(os.environ.get("HUNYUAN_FPS", "16"))
MAX_NUM_FRAMES = int(os.environ.get("HUNYUAN_MAX_NUM_FRAMES", "97"))
MIN_NUM_FRAMES = int(os.environ.get("HUNYUAN_MIN_NUM_FRAMES", "49"))
# On 12 GB GPUs, cap generated frames to avoid OOM; match script duration via export FPS.
VRAM_MAX_FRAMES = int(os.environ.get("HUNYUAN_VRAM_MAX_FRAMES", "81"))
MAX_SCENE_DURATION_SECONDS = int(os.environ.get("HUNYUAN_MAX_SCENE_DURATION", "6"))
# Wan2.1 I2V 480P native resolution (832x480).
VIDEO_WIDTH = int(os.environ.get("HUNYUAN_VIDEO_WIDTH", "832"))
VIDEO_HEIGHT = int(os.environ.get("HUNYUAN_VIDEO_HEIGHT", "480"))
GUIDANCE_SCALE = float(os.environ.get("HUNYUAN_GUIDANCE_SCALE", "5.0"))
MAX_SEQUENCE_LENGTH = int(os.environ.get("HUNYUAN_MAX_SEQUENCE_LENGTH", "512"))
MAX_PROMPT_TOKENS = int(os.environ.get("HUNYUAN_MAX_PROMPT_TOKENS", "96"))
WAN_I2V_FORBIDDEN = re.compile(
    r"\b("
    r"morph(?:ing|s)?|dissolv(?:e|ing|es)|explod(?:e|ing|es)|clone|duplicate|"
    r"multiple versions?|split(?:ting)? screen|on-screen text|subtitle|caption|"
    r"television screen|walking backwards|teleport|transform(?:s|ing)? into|"
    r"world (?:changes|shifts)|appear(?:s|ing) out of thin air|new character"
    r")\b",
    re.I,
)
NEGATIVE_PROMPT = os.environ.get(
    "HUNYUAN_NEGATIVE_PROMPT",
    "Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, "
    "images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, "
    "incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, "
    "misshapen limbs, fused fingers, still picture, messy background, walking backwards",
)
# auto | model | sequential | full
# auto picks sequential offload on <=16 GB VRAM (safest on 12 GB + 32 GB RAM).
OFFLOAD_MODE = os.environ.get("HUNYUAN_OFFLOAD_MODE", "auto")
OFFLOAD_DIR = Path(
    os.environ.get(
        "HUNYUAN_OFFLOAD_DIR",
        str(Path(__file__).resolve().parent / ".offload"),
    )
)
MAX_CPU_MEMORY_GB = float(os.environ.get("HUNYUAN_MAX_CPU_MEMORY_GB", "18"))
WAN_FRAME_STRIDE = 4
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

pipe: WanImageToVideoPipeline | None = None
output_width = VIDEO_WIDTH
output_height = VIDEO_HEIGHT
load_state = "pending"
load_error: str | None = None
_load_lock = threading.Lock()


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


def resolve_inference_steps(vram_gb: float | None) -> int:
    if NUM_INFERENCE_STEPS > 0:
        return NUM_INFERENCE_STEPS
    if vram_gb is not None and vram_gb <= 12:
        return 20
    return 30


def resolve_memory_mode(vram_gb: float | None) -> str:
    if OFFLOAD_MODE != "auto":
        return OFFLOAD_MODE
    if vram_gb is None:
        return "model"
    if vram_gb >= 24:
        return "full"
    if vram_gb >= 16:
        return "model"
    # 12 GB: bf16 14B transformer does not fit with model offload (moves whole model to GPU).
    return "sequential"


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


def free_memory() -> None:
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def build_load_budget(vram_gb: float | None) -> dict[int | str, str]:
    """Cap CPU/GPU memory during weight load to avoid exhausting 32 GB RAM."""
    budget: dict[int | str, str] = {"cpu": f"{int(MAX_CPU_MEMORY_GB)}GiB"}
    if torch.cuda.is_available() and vram_gb is not None:
        gpu_budget = max(6, int(vram_gb - 3))
        budget[0] = f"{gpu_budget}GiB"
    return budget


def resolve_transformer_dtype() -> torch.dtype:
    """Weight dtype used when reading the checkpoint from disk."""
    if MODEL_PRECISION == "fp8":
        if not hasattr(torch, "float8_e4m3fn"):
            raise RuntimeError(
                "PyTorch FP8 (float8_e4m3fn) is unavailable. "
                "Upgrade PyTorch or set HUNYUAN_PRECISION=bf16.",
            )
        return torch.float8_e4m3fn
    return torch.bfloat16


def resolve_inference_dtype() -> torch.dtype:
    """Compute dtype on GPU — cuDNN conv3d does not support float8_e4m3fn."""
    return torch.bfloat16 if MODEL_PRECISION == "fp8" else resolve_transformer_dtype()


def resolve_text_encoder_dtype() -> torch.dtype:
    return torch.bfloat16


def model_display_name() -> str:
    if MODEL_PRECISION == "fp8":
        return (
            f"Wan2.1-I2V-14B-480P-FP8 ({FP8_TRANSFORMER_REPO}, bf16 inference)"
        )
    return BASE_MODEL_ID


def load_fp8_transformer() -> WanTransformer3DModel:
    inference_dtype = resolve_inference_dtype()
    logger.info(
        "Loading FP8 transformer from %s/%s",
        FP8_TRANSFORMER_REPO,
        FP8_TRANSFORMER_FILE,
    )
    weights_path = hf_hub_download(
        repo_id=FP8_TRANSFORMER_REPO,
        filename=FP8_TRANSFORMER_FILE,
    )
    transformer = WanTransformer3DModel.from_single_file(
        weights_path,
        config=BASE_MODEL_ID,
        subfolder="transformer",
        torch_dtype=torch.float8_e4m3fn,
        low_cpu_mem_usage=True,
    )
    logger.info(
        "Upcasting FP8 transformer to %s for inference (cuDNN lacks FP8 conv3d)",
        inference_dtype,
    )
    transformer = transformer.to(dtype=inference_dtype, device="cpu")
    free_memory()
    return transformer


def load_heavy_component(
    label: str,
    model_cls: type,
    subfolder: str,
    dtype: torch.dtype,
    vram_gb: float | None,
    *,
    use_device_map: bool,
) -> torch.nn.Module:
    if not use_device_map:
        logger.info("Loading %s to CPU", label)
        model = model_cls.from_pretrained(
            BASE_MODEL_ID,
            subfolder=subfolder,
            torch_dtype=dtype,
            low_cpu_mem_usage=True,
        )
        free_memory()
        return model

    OFFLOAD_DIR.mkdir(parents=True, exist_ok=True)
    budget = build_load_budget(vram_gb)
    logger.info("Loading %s (budget=%s, offload=%s)", label, budget, OFFLOAD_DIR)
    model = model_cls.from_pretrained(
        BASE_MODEL_ID,
        subfolder=subfolder,
        torch_dtype=dtype,
        low_cpu_mem_usage=True,
        device_map="auto",
        max_memory=budget,
        offload_folder=str(OFFLOAD_DIR),
    )
    free_memory()
    return model


def should_use_device_map_loading(memory_mode: str) -> bool:
    """Use accelerate device_map during load to stay within 32 GB system RAM."""
    if MODEL_PRECISION == "fp8":
        return False
    return memory_mode != "full"


def round_to_valid_wan_frames(frames: int) -> int:
    """Wan VAE requires num_frames = 4n + 1."""
    if frames <= 1:
        return WAN_FRAME_STRIDE + 1
    remainder = (frames - 1) % WAN_FRAME_STRIDE
    if remainder == 0:
        return frames
    return frames + (WAN_FRAME_STRIDE - remainder)


def clamp_num_frames(duration_seconds: int | None) -> int:
    if duration_seconds is not None:
        duration_seconds = max(1, min(MAX_SCENE_DURATION_SECONDS, duration_seconds))

    if duration_seconds is None:
        target = DEFAULT_NUM_FRAMES
    else:
        target = duration_seconds * FPS

    target = round_to_valid_wan_frames(target)
    clamped = max(MIN_NUM_FRAMES, min(MAX_NUM_FRAMES, target))
    clamped = round_to_valid_wan_frames(clamped)

    if duration_seconds is not None and target != clamped:
        logger.info(
            "Capped scene duration %ss (%s frames) to %s frames",
            duration_seconds,
            target,
            clamped,
        )
    return clamped


def apply_vram_frame_budget(num_frames: int) -> int:
    """Limit generated frames on 12 GB VRAM; use resolve_export_fps for wall-clock duration."""
    vram_gb = detect_vram_gb()
    if vram_gb is None or vram_gb > 12:
        return num_frames

    capped = min(num_frames, VRAM_MAX_FRAMES)
    capped = round_to_valid_wan_frames(capped)
    if capped != num_frames:
        logger.info(
            "VRAM budget on %.0f GB GPU: generate %s frames (requested %s); "
            "export FPS will be adjusted to match scene duration",
            vram_gb,
            capped,
            num_frames,
        )
    return capped


def resolve_export_fps(num_frames: int, duration_seconds: int | None) -> float:
    """Keep MP4 timeline aligned with script duration when frame count was VRAM-limited."""
    if duration_seconds is None:
        return float(FPS)

    native_seconds = num_frames / FPS
    if native_seconds >= duration_seconds - 0.05:
        return float(FPS)

    export_fps = num_frames / duration_seconds
    logger.info(
        "Timeline match: %s frames over %ss -> export at %.2f fps (model native %s fps)",
        num_frames,
        duration_seconds,
        export_fps,
        FPS,
    )
    return export_fps


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
    text = WAN_I2V_FORBIDDEN.sub("", text)
    text = re.sub(r"\s+", " ", text).strip(" ,.-")
    return text


def prefer_motion_sentences(sentences: list[str], max_sentences: int = 2) -> list[str]:
    """Keep the shortest motion-rich sentences — Wan I2V works best with 1–2 lines."""
    if not sentences:
        return []
    ranked = sorted(
        sentences,
        key=lambda sentence: (score_motion_sentence(sentence), -len(sentence)),
        reverse=True,
    )
    return ranked[:max_sentences]


def score_motion_sentence(sentence: str) -> int:
    lowered = sentence.lower()
    return sum(1 for keyword in MOTION_KEYWORDS if keyword in lowered)


def prepare_wan_prompt(
    prompt: str,
    pipeline: WanImageToVideoPipeline,
    max_tokens: int = MAX_PROMPT_TOKENS,
) -> str:
    """Fit prompt into Wan UMT5 limit, keeping short motion/action over boilerplate."""
    text = strip_character_boilerplate(prompt)
    if not text:
        text = prompt.strip()

    tokenizer = pipeline.tokenizer
    token_ids = tokenizer.encode(text, add_special_tokens=False)
    if len(token_ids) <= max_tokens:
        return text

    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
    if sentences:
        motion_first = prefer_motion_sentences(sentences)
        for limit in (2, 1):
            subset = motion_first[:limit]
            if not subset:
                continue
            compact = " ".join(subset)
            compact_ids = tokenizer.encode(compact, add_special_tokens=False)
            if len(compact_ids) <= max_tokens:
                logger.info(
                    "Compressed prompt from %s to %s tokens (%s motion sentence(s))",
                    len(token_ids),
                    len(compact_ids),
                    len(subset),
                )
                return compact

        ranked = sorted(
            sentences,
            key=lambda sentence: (score_motion_sentence(sentence), -len(sentence)),
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

    head_ids = token_ids[:max_tokens]
    compact = tokenizer.decode(head_ids, skip_special_tokens=True).strip()
    logger.info(
        "Trimmed prompt from %s to %s tokens (kept head with primary motion)",
        len(token_ids),
        max_tokens,
    )
    return compact


def configure_vae_memory(pipeline: WanImageToVideoPipeline) -> None:
    if pipeline.vae is None:
        return
    if hasattr(pipeline.vae, "enable_tiling"):
        pipeline.vae.enable_tiling()
    if hasattr(pipeline.vae, "enable_slicing"):
        pipeline.vae.enable_slicing()


def load_pipeline(
    device: str,
    dtype: torch.dtype,
    memory_mode: str,
    vram_gb: float | None,
) -> WanImageToVideoPipeline:
    """Load Wan components one at a time to keep peak system RAM under ~32 GB."""
    transformer_dtype = resolve_transformer_dtype()
    text_encoder_dtype = resolve_text_encoder_dtype()
    use_device_map = should_use_device_map_loading(memory_mode)

    logger.info(
        "Loading lightweight Wan components from %s (precision=%s)",
        BASE_MODEL_ID,
        MODEL_PRECISION,
    )
    tokenizer = T5TokenizerFast.from_pretrained(BASE_MODEL_ID, subfolder="tokenizer")
    free_memory()

    scheduler = UniPCMultistepScheduler.from_pretrained(BASE_MODEL_ID, subfolder="scheduler")
    free_memory()

    image_processor = CLIPImageProcessor.from_pretrained(
        BASE_MODEL_ID,
        subfolder="image_processor",
    )
    free_memory()

    vae = AutoencoderKLWan.from_pretrained(
        BASE_MODEL_ID,
        subfolder="vae",
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
    )
    free_memory()

    image_encoder = CLIPVisionModelWithProjection.from_pretrained(
        BASE_MODEL_ID,
        subfolder="image_encoder",
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
    )
    free_memory()

    if MODEL_PRECISION == "fp8":
        transformer = load_fp8_transformer()
    else:
        transformer = load_heavy_component(
            "transformer (14B)",
            WanTransformer3DModel,
            "transformer",
            transformer_dtype,
            vram_gb,
            use_device_map=use_device_map,
        )

    text_encoder = load_heavy_component(
        "text encoder (UMT5)",
        UMT5EncoderModel,
        "text_encoder",
        text_encoder_dtype,
        vram_gb,
        use_device_map=use_device_map,
    )

    logger.info("Assembling Wan I2V pipeline")
    pipeline = WanImageToVideoPipeline(
        tokenizer=tokenizer,
        text_encoder=text_encoder,
        vae=vae,
        scheduler=scheduler,
        image_encoder=image_encoder,
        image_processor=image_processor,
        transformer=transformer,
    )

    if device == "cuda":
        configure_vae_memory(pipeline)
        if use_device_map:
            # Weights were placed via accelerate device_map (some on disk/meta).
            # A second cpu_offload pass tries to copy meta tensors and crashes.
            logger.info(
                "Pipeline ready with accelerate device_map (disk/cpu/gpu); "
                "secondary cpu offload skipped",
            )
            return pipeline
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


def describe_memory_mode(memory_mode: str, device: str, *, device_map_load: bool = False) -> str:
    if device != "cuda":
        return device
    if device_map_load:
        return "cuda (accelerate device_map + VAE tiling)"
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
    orientation: str = Field(default="landscape")
    width: int | None = Field(default=None, ge=256, le=2048)
    height: int | None = Field(default=None, ge=256, le=2048)


class GenerateVideoResponse(BaseModel):
    filename: str
    videoPath: str


def load_model_sync() -> None:
    global pipe, output_width, output_height, load_state, load_error

    with _load_lock:
        if load_state in ("loading", "ready"):
            return
        load_state = "loading"

    try:
        VIDEO_DIR.mkdir(parents=True, exist_ok=True)
        IMAGE_DIR.mkdir(parents=True, exist_ok=True)

        device = resolve_device()
        dtype = torch.bfloat16 if device != "cpu" else torch.float32
        vram_gb = detect_vram_gb()
        memory_mode = resolve_memory_mode(vram_gb)

        logger.info(
            "Loading Wan I2V pipeline %s on %s (VRAM=%s GB, mode=%s, precision=%s)",
            model_display_name(),
            device,
            f"{vram_gb:.1f}" if vram_gb is not None else "n/a",
            memory_mode,
            MODEL_PRECISION,
        )
        loaded_pipe = load_pipeline(device, dtype, memory_mode, vram_gb)
        mode_label = describe_memory_mode(
            memory_mode,
            device,
            device_map_load=should_use_device_map_loading(memory_mode),
        )
        transformer_dtype = resolve_inference_dtype()

        with _load_lock:
            pipe = loaded_pipe
            output_width = VIDEO_WIDTH
            output_height = VIDEO_HEIGHT
            load_state = "ready"
            load_error = None

        logger.info(
            "Wan I2V pipeline ready mode=%s transformer_dtype=%s size=%sx%s fps=%s",
            mode_label,
            transformer_dtype,
            output_width,
            output_height,
            FPS,
        )
        log_cuda_memory("VRAM after model load")
    except Exception as exc:
        with _load_lock:
            load_error = str(exc)
            load_state = "error"
        logger.exception("Failed to load Wan I2V pipeline")


@asynccontextmanager
async def lifespan(app: FastAPI):
    loader = threading.Thread(
        target=load_model_sync,
        name="wan-model-loader",
        daemon=True,
    )
    loader.start()
    yield


app = FastAPI(title="Wan I2V Service", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    with _load_lock:
        state = load_state
        error = load_error

    if state == "ready" and pipe is not None:
        return {"status": "ok", "model": model_display_name(), "precision": MODEL_PRECISION}
    if state == "loading":
        return {"status": "loading", "model": model_display_name(), "precision": MODEL_PRECISION}
    if state == "error":
        raise HTTPException(
            status_code=503,
            detail=error or "Wan I2V pipeline failed to load",
        )
    return {"status": "starting", "model": model_display_name(), "precision": MODEL_PRECISION}


@app.post("/generate", response_model=GenerateVideoResponse)
def generate_video(request: GenerateVideoRequest) -> GenerateVideoResponse:
    if pipe is None:
        raise HTTPException(
            status_code=503,
            detail="Wan I2V pipeline is not ready",
        )

    image_path = IMAGE_DIR / request.image_filename
    if not image_path.is_file():
        raise HTTPException(
            status_code=400,
            detail=f"Image not found: {request.image_filename}",
        )

    filename = f"scene-{request.scene_number}-{uuid.uuid4().hex}.mp4"
    output_path = VIDEO_DIR / filename
    num_frames = apply_vram_frame_budget(clamp_num_frames(request.duration_seconds))
    export_fps = resolve_export_fps(num_frames, request.duration_seconds)
    frame_width = request.width or (
        VIDEO_HEIGHT if request.orientation == "portrait" else output_width
    )
    frame_height = request.height or (
        VIDEO_WIDTH if request.orientation == "portrait" else output_height
    )

    try:
        image = load_image(str(image_path))
        motion_prompt = prepare_wan_prompt(request.prompt, pipe)
        inference_steps = resolve_inference_steps(detect_vram_gb())
        logger.info(
            "Generating scene %s (%sx%s, %s frames, %s steps, export %.2f fps, guidance=%s)",
            request.scene_number,
            frame_width,
            frame_height,
            num_frames,
            inference_steps,
            export_fps,
            GUIDANCE_SCALE,
        )
        logger.info("Motion prompt: %s", motion_prompt[:240])
        free_memory()
        log_cuda_memory("VRAM before generate")
        with torch.inference_mode():
            result = pipe(
                image=image,
                prompt=motion_prompt,
                negative_prompt=NEGATIVE_PROMPT,
                width=frame_width,
                height=frame_height,
                num_frames=num_frames,
                num_inference_steps=inference_steps,
                guidance_scale=GUIDANCE_SCALE,
                max_sequence_length=MAX_SEQUENCE_LENGTH,
            )
        export_to_video(result.frames[0], str(output_path), fps=export_fps)
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
