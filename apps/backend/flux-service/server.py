from __future__ import annotations

import logging
import os
import re
import uuid
from pathlib import Path

import torch
import uvicorn
from diffusers import FluxPipeline
from fastapi import FastAPI, HTTPException
from PIL import Image
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
IP_ADAPTER_TRUE_CFG_SCALE = float(os.environ.get("FLUX_IP_ADAPTER_TRUE_CFG", "4.0"))
IMAGE_WIDTH = int(os.environ.get("FLUX_IMAGE_WIDTH", "832"))
IMAGE_HEIGHT = int(os.environ.get("FLUX_IMAGE_HEIGHT", "480"))
FLUX_CLIP_MAX_TOKENS = int(os.environ.get("FLUX_CLIP_MAX_TOKENS", "77"))
FLUX_PROMPT_SUFFIX = os.environ.get("FLUX_PROMPT_SUFFIX", "").strip()
FLUX_SCENE_GUARD = os.environ.get(
    "FLUX_SCENE_GUARD",
    "no glasses, no spectacles, no eyeglasses, no modern accessories",
).strip()
IP_ADAPTER_MODEL = os.environ.get(
    "FLUX_IP_ADAPTER_MODEL",
    "XLabs-AI/flux-ip-adapter-v2",
).strip()
IP_ADAPTER_WEIGHT = os.environ.get(
    "FLUX_IP_ADAPTER_WEIGHT",
    "ip_adapter.safetensors",
).strip()
IP_ADAPTER_ENCODER = os.environ.get(
    "FLUX_IP_ADAPTER_ENCODER",
    "openai/clip-vit-large-patch14",
).strip()
IP_ADAPTER_SCALE = float(os.environ.get("FLUX_IP_ADAPTER_SCALE", "0.65"))
IP_ADAPTER_SCENE_SCALE = float(
    os.environ.get("FLUX_SCENE_IP_ADAPTER_SCALE", "0.65"),
)
IP_ADAPTER_CAST_SHEET_SCALE = float(
    os.environ.get("FLUX_CAST_SHEET_IP_ADAPTER_SCALE", "0.35"),
)
IP_ADAPTER_FULLBODY_SCALE = float(
    os.environ.get("FLUX_FULLBODY_IP_ADAPTER_SCALE", "0.88"),
)
IP_ADAPTER_REFERENCE_SIZE = int(os.environ.get("FLUX_IP_ADAPTER_REFERENCE_SIZE", "512"))


def env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


# Scene IP-Adapter is off by default; cast-sheet references opt in automatically.
IP_ADAPTER_FOR_SCENES = env_bool("FLUX_USE_IP_ADAPTER_FOR_SCENES", False)
# full = all weights on GPU (needs ~24GB VRAM)
# model = move one component at a time (good for 16GB)
# sequential = submodule-level offload (safest for 12GB)
OFFLOAD_MODE = os.environ.get("FLUX_OFFLOAD_MODE", "sequential")

NAME_STOPWORDS = {
    "All",
    "Character",
    "Characters",
    "Group",
    "In",
    "Scene",
    "Shot",
    "The",
    "Two",
    "Wide",
}

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="FLUX Image Service")
pipe: FluxPipeline | None = None
ip_adapter_loaded = False


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


def ensure_ip_adapter(pipeline: FluxPipeline) -> bool:
    global ip_adapter_loaded

    if ip_adapter_loaded or not IP_ADAPTER_MODEL:
        return ip_adapter_loaded

    try:
        pipeline.load_ip_adapter(
            IP_ADAPTER_MODEL,
            weight_name=IP_ADAPTER_WEIGHT,
            image_encoder_pretrained_model_name_or_path=IP_ADAPTER_ENCODER,
        )
        pipeline.set_ip_adapter_scale(IP_ADAPTER_SCALE)
        ip_adapter_loaded = True
        logger.info(
            "Loaded IP-Adapter model=%s scale=%s",
            IP_ADAPTER_MODEL,
            IP_ADAPTER_SCALE,
        )
    except Exception as error:
        logger.warning("IP-Adapter unavailable, using text-only generation: %s", error)
        ip_adapter_loaded = False

    return ip_adapter_loaded


def strip_flux_boilerplate(prompt: str) -> str:
    """Remove resolution/aspect tags that waste CLIP tokens without helping FLUX."""
    text = prompt.strip()
    text = re.sub(
        r"\b(horizontal\s*)?16\s*:\s*9\b[^.]*",
        "",
        text,
        flags=re.I,
    )
    text = re.sub(r"\b9\s*:\s*16\b[^.]*", "", text, flags=re.I)
    text = re.sub(r"\b832\s*[x×]\s*480\b", "", text, flags=re.I)
    text = re.sub(r"\b480\s*[x×]\s*832\b", "", text, flags=re.I)
    text = re.sub(
        r"\b(keyframe|frozen moment|single frame|photographable frame)\b",
        "",
        text,
        flags=re.I,
    )
    text = re.sub(r"\s+", " ", text).strip(" ,.-")
    return text


def clip_encode(
    tokenizer,
    text: str,
    *,
    add_special_tokens: bool = True,
    max_length: int | None = None,
) -> list[int]:
    """Encode with truncation enabled so long prompts never trigger tokenizer warnings."""
    return tokenizer.encode(
        text,
        add_special_tokens=add_special_tokens,
        truncation=True,
        max_length=max_length or 512,
    )


def clip_token_count(tokenizer, text: str) -> int:
    return len(clip_encode(tokenizer, text))


def truncate_to_clip_tokens(tokenizer, text: str, max_tokens: int) -> str:
    token_ids = clip_encode(
        tokenizer,
        text,
        add_special_tokens=True,
        max_length=max_tokens,
    )
    return tokenizer.decode(token_ids, skip_special_tokens=True).strip()


def extract_character_names(text: str) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()

    for match in re.finditer(r"\b([A-Z][A-Za-z'-]{1,30})\s*\(", text):
        name = match.group(1)
        if name in NAME_STOPWORDS or name in seen:
            continue
        seen.add(name)
        names.append(name)

    for match in re.finditer(
        r"\ball\s+(\d+)\s+characters?\s+visible:\s*([^.]+)",
        text,
        flags=re.I,
    ):
        for part in re.split(r",|\band\b", match.group(2)):
            name = part.strip()
            if name and name not in seen and name not in NAME_STOPWORDS:
                seen.add(name)
                names.append(name)

    for match in re.finditer(
        r"\b([A-Z][A-Za-z'-]{1,30}):\s*[^;.]+",
        text,
    ):
        name = match.group(1)
        if name in NAME_STOPWORDS or name in seen:
            continue
        seen.add(name)
        names.append(name)

    lead = text.split(".", 1)[0]
    for match in re.finditer(
        r"\b([A-Z][A-Za-z'-]{1,30})(?=\s*(?:,|and)\s+[A-Z])",
        lead,
    ):
        name = match.group(1)
        if name in NAME_STOPWORDS or name in seen:
            continue
        seen.add(name)
        names.append(name)

    return names


def extract_appearance_tags(text: str) -> str:
    tags: list[str] = []
    for match in re.finditer(
        r"\b([A-Z][A-Za-z'-]{1,30}):\s*([^;.]+)",
        text,
    ):
        name = match.group(1)
        if name in NAME_STOPWORDS:
            continue
        tag = match.group(2).strip(" ,.-")
        if tag:
            tags.append(f"{name}: {tag}")

    return "; ".join(tags)


def build_character_anchor(names: list[str]) -> str:
    if not names:
        return ""
    if len(names) == 1:
        return f"Character visible: {names[0]}."
    joined = ", ".join(names)
    return f"All {len(names)} characters visible: {joined}."


def first_sentence(text: str) -> str:
    match = re.search(r"^[^.!?]+[.!?]?", text.strip())
    if match and match.group(0).strip():
        return match.group(0).strip()
    return text.strip()


def append_scene_guard(prompt: str) -> str:
    if not FLUX_SCENE_GUARD:
        return prompt
    guard = FLUX_SCENE_GUARD.lower()
    if guard in prompt.lower():
        return prompt
    return f"{prompt}, {FLUX_SCENE_GUARD}".strip(" ,")


def prepare_flux_prompt(prompt: str, pipeline: FluxPipeline) -> str:
    """Fit prompt into CLIP's 77-token limit, preserving character appearance tags."""
    text = strip_flux_boilerplate(prompt) or prompt.strip()
    tokenizer = pipeline.tokenizer
    original_tokens = clip_token_count(tokenizer, text)

    suffix = FLUX_PROMPT_SUFFIX
    suffix_tokens = clip_token_count(tokenizer, f"x, {suffix}") if suffix else 0
    text_budget = max(24, FLUX_CLIP_MAX_TOKENS - suffix_tokens)

    if original_tokens <= text_budget:
        result = f"{text}, {suffix}" if suffix else text
        if clip_token_count(tokenizer, result) <= FLUX_CLIP_MAX_TOKENS:
            return append_scene_guard(result)
        result = truncate_to_clip_tokens(tokenizer, text, text_budget)
        if suffix:
            result = f"{result}, {suffix}"
        return append_scene_guard(result)

    names = extract_character_names(text)
    anchor = build_character_anchor(names)
    appearance_tags = extract_appearance_tags(text)
    lead = first_sentence(text)

    candidates: list[str] = []
    if appearance_tags and anchor:
        candidates.append(f"{anchor} {appearance_tags}".strip())
    if appearance_tags:
        candidates.append(appearance_tags)
    if anchor and anchor.lower() not in lead.lower():
        candidates.append(f"{lead} {anchor}".strip())
    if appearance_tags:
        candidates.append(f"{lead} {appearance_tags}".strip())
    candidates.append(lead)
    if anchor:
        candidates.append(anchor)
    candidates.append(text)

    compact = lead
    for candidate in candidates:
        count = clip_token_count(tokenizer, candidate)
        if count <= text_budget and count >= clip_token_count(tokenizer, compact):
            compact = candidate
    if clip_token_count(tokenizer, compact) > text_budget:
        if appearance_tags:
            compact = truncate_to_clip_tokens(tokenizer, appearance_tags, text_budget)
        else:
            compact = truncate_to_clip_tokens(tokenizer, text, text_budget)

    if names and not any(name.lower() in compact.lower() for name in names):
        anchored = f"{compact} {anchor}".strip()
        if clip_token_count(tokenizer, anchored) <= text_budget:
            compact = anchored
        elif anchor:
            compact = truncate_to_clip_tokens(
                tokenizer,
                f"{anchor} {appearance_tags or lead}".strip(),
                text_budget,
            )

    result = f"{compact}, {suffix}" if suffix else compact
    if suffix and clip_token_count(tokenizer, result) > FLUX_CLIP_MAX_TOKENS:
        result = compact

    if clip_token_count(tokenizer, result) > FLUX_CLIP_MAX_TOKENS:
        result = truncate_to_clip_tokens(tokenizer, result, FLUX_CLIP_MAX_TOKENS)

    final_tokens = clip_token_count(tokenizer, result)
    if final_tokens > FLUX_CLIP_MAX_TOKENS:
        result = truncate_to_clip_tokens(tokenizer, result, FLUX_CLIP_MAX_TOKENS)
        final_tokens = clip_token_count(tokenizer, result)

    if final_tokens < original_tokens:
        logger.info(
            "CLIP prompt compressed from %s to %s tokens",
            original_tokens,
            final_tokens,
        )

    return append_scene_guard(result)


def resolve_reference_images(reference_image_paths: list[str]) -> list[Image.Image]:
    images: list[Image.Image] = []

    for raw_path in reference_image_paths:
        normalized = raw_path.strip().replace("\\", "/")
        if not normalized:
            continue

        if normalized.startswith("/images/"):
            filename = normalized[len("/images/") :]
        else:
            filename = Path(normalized).name

        file_path = STORAGE_DIR / filename
        if not file_path.is_file():
            logger.warning("Reference image not found: %s", file_path)
            continue

        with Image.open(file_path) as image:
            images.append(image.convert("RGB"))

    return images


def ip_adapter_slot_count(pipeline: FluxPipeline) -> int:
    if not ip_adapter_loaded:
        return 0
    return int(pipeline.transformer.encoder_hid_proj.num_ip_adapters)


def select_ip_adapter_references(
    reference_images: list[Image.Image],
) -> list[Image.Image]:
    """FLUX IP-Adapter v2 has one slot; a collage of portraits degrades scene quality."""
    if len(reference_images) <= 1:
        return reference_images

    logger.info(
        "IP-Adapter supports one reference; using the primary portrait "
        "(%s additional portrait(s) ignored for scene conditioning)",
        len(reference_images) - 1,
    )
    return [reference_images[0]]


def normalize_ip_adapter_reference(image: Image.Image) -> Image.Image:
    """Square-pad portrait refs instead of stretching them to the scene aspect ratio."""
    target = max(224, min(IP_ADAPTER_REFERENCE_SIZE, 768))
    fitted = image.copy()
    fitted.thumbnail((target, target), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (target, target), (0, 0, 0))
    offset = ((target - fitted.width) // 2, (target - fitted.height) // 2)
    canvas.paste(fitted, offset)
    return canvas


def prepare_ip_adapter_reference_images(
    pipeline: FluxPipeline,
    reference_images: list[Image.Image],
) -> Image.Image | list[Image.Image]:
    """Return exactly num_ip_adapters normalized reference image(s) for diffusers."""
    slot_count = ip_adapter_slot_count(pipeline)
    if slot_count <= 0:
        raise ValueError("IP-Adapter is not loaded")

    selected = select_ip_adapter_references(reference_images)
    normalized = [normalize_ip_adapter_reference(image) for image in selected]

    if len(normalized) == slot_count:
        return normalized[0] if slot_count == 1 else normalized

    if len(normalized) > slot_count:
        return normalized[:slot_count]

    padded = list(normalized)
    while len(padded) < slot_count:
        padded.append(Image.new("RGB", (IP_ADAPTER_REFERENCE_SIZE, IP_ADAPTER_REFERENCE_SIZE), (0, 0, 0)))
    return padded[0] if slot_count == 1 else padded


def attach_ip_adapter_kwargs(
    pipe_kwargs: dict,
    prepared: Image.Image | list[Image.Image],
) -> None:
    pipe_kwargs.pop("ip_adapter_image_embeds", None)
    pipe_kwargs.pop("negative_prompt", None)
    pipe_kwargs.pop("true_cfg_scale", None)
    pipe_kwargs["ip_adapter_image"] = prepared


def attach_neutral_ip_adapter(
    pipeline: FluxPipeline,
    pipe_kwargs: dict,
) -> None:
    """Satisfy loaded IP-Adapter blocks when visual conditioning is disabled."""
    neutral = Image.new(
        "RGB",
        (IP_ADAPTER_REFERENCE_SIZE, IP_ADAPTER_REFERENCE_SIZE),
        (0, 0, 0),
    )
    prepared = prepare_ip_adapter_reference_images(pipeline, [neutral])
    attach_ip_adapter_kwargs(pipe_kwargs, prepared)
    pipeline.set_ip_adapter_scale(0.0)


def should_use_scene_ip_adapter(
    scene_number: int,
    reference_kind: str | None,
    reference_images: list[Image.Image],
) -> bool:
    if scene_number == 0:
        return bool(reference_images)
    if reference_kind in ("cast_sheet", "portrait") and reference_images:
        return True
    return False


def configure_ip_adapter_inputs(
    pipeline: FluxPipeline,
    pipe_kwargs: dict,
    *,
    reference_images: list[Image.Image],
    scene_number: int,
    reference_kind: str | None = None,
) -> bool:
    """Attach IP-Adapter kwargs when reference images exist or weights are already loaded."""
    use_ip_adapter = should_use_scene_ip_adapter(
        scene_number,
        reference_kind,
        reference_images,
    )

    if scene_number > 0 and not use_ip_adapter:
        if ip_adapter_loaded:
            attach_neutral_ip_adapter(pipeline, pipe_kwargs)
        return False

    if scene_number > 0:
        scene_scale = (
            IP_ADAPTER_CAST_SHEET_SCALE
            if reference_kind == "cast_sheet"
            else IP_ADAPTER_SCENE_SCALE
        )
    elif reference_kind == "portrait_extension":
        scene_scale = IP_ADAPTER_FULLBODY_SCALE
    else:
        scene_scale = IP_ADAPTER_SCALE

    if reference_images and ensure_ip_adapter(pipeline):
        prepared = prepare_ip_adapter_reference_images(pipeline, reference_images)
        attach_ip_adapter_kwargs(pipe_kwargs, prepared)
        pipeline.set_ip_adapter_scale(scene_scale)
        if scene_number > 0:
            logger.info(
                "Using IP-Adapter scale=%s kind=%s for scene %s with %s reference image(s)",
                scene_scale,
                reference_kind or "unknown",
                scene_number,
                len(reference_images),
            )
        elif reference_kind == "portrait_extension":
            logger.info(
                "Using IP-Adapter scale=%s to extend portrait to full body",
                scene_scale,
            )
        return True

    if ip_adapter_loaded and scene_number == 0:
        attach_neutral_ip_adapter(pipeline, pipe_kwargs)

    return False


def resolve_generator(seed: int | None, device: str) -> torch.Generator | None:
    if seed is None:
        return None

    generator = torch.Generator(device="cpu")
    generator.manual_seed(seed)
    return generator


CAST_SHEET_BACKGROUND = (245, 242, 235)
CAST_SHEET_HEIGHT = int(os.environ.get("FLUX_CAST_SHEET_HEIGHT", "832"))
FULLBODY_CANVAS_WIDTH = int(os.environ.get("FLUX_FULLBODY_WIDTH", "480"))
FULLBODY_CANVAS_HEIGHT = int(os.environ.get("FLUX_FULLBODY_HEIGHT", "832"))
FULLBODY_HEAD_RATIO = float(os.environ.get("FLUX_FULLBODY_HEAD_RATIO", "0.42"))


def sample_portrait_background(image: Image.Image) -> tuple[int, int, int]:
    """Pick a neutral background color from portrait edges."""
    pixels = image.load()
    width, height = image.size
    sample_points = [
        (0, 0),
        (width - 1, 0),
        (0, height - 1),
        (width - 1, height - 1),
        (width // 2, 0),
        (width // 2, height - 1),
    ]
    channels: list[tuple[int, int, int]] = []
    for x, y in sample_points:
        pixel = pixels[x, y]
        if isinstance(pixel, int):
            channels.append((pixel, pixel, pixel))
        else:
            channels.append(tuple(int(value) for value in pixel[:3]))
    red = sum(channel[0] for channel in channels) // len(channels)
    green = sum(channel[1] for channel in channels) // len(channels)
    blue = sum(channel[2] for channel in channels) // len(channels)
    return red, green, blue


def extend_portrait_to_fullbody(
    portrait_path: str,
    *,
    filename_prefix: str | None = None,
    canvas_width: int | None = None,
    canvas_height: int | None = None,
) -> tuple[str, str]:
    """Build a full-body ref by keeping the approved portrait pixels on top."""
    images = resolve_reference_images([portrait_path])
    if not images:
        raise HTTPException(status_code=404, detail=f"Portrait not found: {portrait_path}")

    portrait = images[0]
    width = canvas_width or FULLBODY_CANVAS_WIDTH
    height = canvas_height or FULLBODY_CANVAS_HEIGHT
    canvas = Image.new("RGB", (width, height), sample_portrait_background(portrait))

    head_max_height = max(64, int(height * FULLBODY_HEAD_RATIO))
    fitted = portrait.copy()
    fitted.thumbnail((width, head_max_height), Image.Resampling.LANCZOS)
    x = (width - fitted.width) // 2
    canvas.paste(fitted, (x, 0))

    # Keep the lower canvas as neutral background. Stretching a robe strip
    # vertically produces severe smear artifacts in cast sheets.

    prefix = re.sub(
        r"[^a-z0-9-]+",
        "-",
        (filename_prefix or "character-fullbody").lower(),
    ).strip("-")
    filename = f"{prefix or 'character-fullbody'}.png"
    output_path = STORAGE_DIR / filename
    canvas.save(output_path)
    logger.info(
        "Extended portrait to full-body reference without regeneration: %s (%sx%s)",
        filename,
        width,
        height,
    )
    return filename, f"/images/{filename}"


def compose_cast_sheet(
    reference_image_paths: list[str],
    *,
    filename_prefix: str | None = None,
    canvas_width: int | None = None,
    canvas_height: int | None = None,
) -> tuple[str, str]:
    """Stitch character reference images into a side-by-side full-body cast lineup."""
    images = resolve_reference_images(reference_image_paths)
    if len(images) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least two character reference images are required",
        )

    width = canvas_width or IMAGE_WIDTH
    height = canvas_height or CAST_SHEET_HEIGHT
    canvas = Image.new("RGB", (width, height), CAST_SHEET_BACKGROUND)

    slot_count = len(images)
    slot_width = width // slot_count
    padding = max(16, width // 40)

    for index, image in enumerate(images):
        fitted = image.copy()
        max_width = max(64, slot_width - padding * 2)
        max_height = max(64, height - padding * 2)
        fitted.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
        x = index * slot_width + (slot_width - fitted.width) // 2
        y = (height - fitted.height) // 2
        canvas.paste(fitted, (x, max(padding // 2, y)))

    prefix = re.sub(r"[^a-z0-9-]+", "-", (filename_prefix or "cast-sheet").lower()).strip("-")
    filename = f"{prefix or 'cast-sheet'}.png"
    output_path = STORAGE_DIR / filename
    canvas.save(output_path)
    logger.info(
        "Composed full-body cast reference sheet from %s character image(s): %s (%sx%s)",
        len(images),
        filename,
        width,
        height,
    )
    return filename, f"/images/{filename}"


class ComposeCastSheetRequest(BaseModel):
    reference_image_paths: list[str] = Field(min_length=2)
    filename_prefix: str | None = Field(default=None, min_length=1, max_length=80)
    canvas_width: int | None = Field(default=None, ge=256, le=2048)
    canvas_height: int | None = Field(default=None, ge=256, le=2048)


class ExtendPortraitFullBodyRequest(BaseModel):
    portrait_image_path: str = Field(min_length=1)
    filename_prefix: str | None = Field(default=None, min_length=1, max_length=80)
    canvas_width: int | None = Field(default=None, ge=256, le=2048)
    canvas_height: int | None = Field(default=None, ge=256, le=2048)


class GenerateImageRequest(BaseModel):
    prompt: str = Field(min_length=1)
    scene_number: int = Field(ge=0)
    orientation: str = Field(default="landscape")
    width: int | None = Field(default=None, ge=256, le=2048)
    height: int | None = Field(default=None, ge=256, le=2048)
    seed: int | None = Field(default=None, ge=0)
    reference_image_paths: list[str] = Field(default_factory=list)
    reference_kind: str | None = Field(default=None)
    filename_prefix: str | None = Field(default=None, min_length=1, max_length=80)


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
    if IP_ADAPTER_MODEL:
        ensure_ip_adapter(pipe)
    memory_mode = configure_pipeline_memory(pipe, device)

    logger.info(
        "FLUX pipeline loaded mode=%s dtype=%s size=%sx%s clip_max=%s ip_adapter=%s scenes_ip_adapter=%s",
        memory_mode,
        dtype,
        IMAGE_WIDTH,
        IMAGE_HEIGHT,
        FLUX_CLIP_MAX_TOKENS,
        ip_adapter_loaded,
        IP_ADAPTER_FOR_SCENES,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "model": MODEL_ID,
        "ip_adapter": str(ip_adapter_loaded),
        "ip_adapter_for_scenes": str(IP_ADAPTER_FOR_SCENES),
    }


@app.post("/extend-portrait-fullbody", response_model=GenerateImageResponse)
def extend_portrait_fullbody_endpoint(
    request: ExtendPortraitFullBodyRequest,
) -> GenerateImageResponse:
    filename, image_path = extend_portrait_to_fullbody(
        request.portrait_image_path,
        filename_prefix=request.filename_prefix,
        canvas_width=request.canvas_width,
        canvas_height=request.canvas_height,
    )
    return GenerateImageResponse(filename=filename, imagePath=image_path)


@app.post("/compose-cast-sheet", response_model=GenerateImageResponse)
def compose_cast_sheet_endpoint(
    request: ComposeCastSheetRequest,
) -> GenerateImageResponse:
    filename, image_path = compose_cast_sheet(
        request.reference_image_paths,
        filename_prefix=request.filename_prefix,
        canvas_width=request.canvas_width,
        canvas_height=request.canvas_height,
    )
    return GenerateImageResponse(filename=filename, imagePath=image_path)


@app.post("/generate", response_model=GenerateImageResponse)
def generate_image(request: GenerateImageRequest) -> GenerateImageResponse:
    if pipe is None:
        raise HTTPException(status_code=503, detail="FLUX pipeline is not ready")

    prefix = re.sub(r"[^a-z0-9-]+", "-", (request.filename_prefix or "").lower()).strip("-")
    if prefix:
        filename = f"{prefix}.png"
    elif request.scene_number > 0:
        filename = f"scene-{request.scene_number}-{uuid.uuid4().hex}.png"
    else:
        filename = f"image-{uuid.uuid4().hex}.png"

    output_path = STORAGE_DIR / filename
    width = request.width or (
        IMAGE_HEIGHT if request.orientation == "portrait" else IMAGE_WIDTH
    )
    height = request.height or (
        IMAGE_WIDTH if request.orientation == "portrait" else IMAGE_HEIGHT
    )

    reference_images = resolve_reference_images(request.reference_image_paths)
    generator = resolve_generator(request.seed, resolve_device())

    try:
        flux_prompt = (
            strip_flux_boilerplate(request.prompt) or request.prompt.strip()
            if request.scene_number == 0
            else prepare_flux_prompt(request.prompt, pipe)
        )
        pipe_kwargs: dict = {
            "prompt": flux_prompt,
            "height": height,
            "width": width,
            "guidance_scale": GUIDANCE_SCALE,
            "num_inference_steps": NUM_INFERENCE_STEPS,
        }
        if generator is not None:
            pipe_kwargs["generator"] = generator

        use_ip_adapter = configure_ip_adapter_inputs(
            pipe,
            pipe_kwargs,
            reference_images=reference_images,
            scene_number=request.scene_number,
            reference_kind=request.reference_kind,
        )
        if use_ip_adapter:
            logger.info(
                "Scene %s conditioned on %s reference image(s)",
                request.scene_number,
                request.reference_kind or "character",
            )
        elif ip_adapter_loaded and request.scene_number == 0:
            logger.info(
                "IP-Adapter loaded but no reference images for scene %s; using neutral placeholder",
                request.scene_number,
            )

        with torch.inference_mode():
            result = pipe(**pipe_kwargs)
        image = result.images[0]
        image.save(output_path)
    finally:
        if ip_adapter_loaded:
            pipe.set_ip_adapter_scale(IP_ADAPTER_SCALE)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    return GenerateImageResponse(
        filename=filename,
        imagePath=f"/images/{filename}",
    )


if __name__ == "__main__":
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)
