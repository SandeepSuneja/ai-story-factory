import logging
import os
import re
import subprocess
import uuid
from pathlib import Path

import imageio_ffmpeg
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

HOST = os.environ.get("UPSCALE_HOST", "127.0.0.1")
PORT = int(os.environ.get("UPSCALE_PORT", "7864"))
VIDEO_DIR = Path(
    os.environ.get(
        "VIDEO_STORAGE_DIR",
        str(Path(__file__).resolve().parent.parent / "storage" / "videos"),
    )
)
TARGET_WIDTH = int(os.environ.get("UPSCALE_TARGET_WIDTH", "1920"))
TARGET_HEIGHT = int(os.environ.get("UPSCALE_TARGET_HEIGHT", "1080"))
MIN_UPSCALE_HEIGHT = int(os.environ.get("UPSCALE_MIN_HEIGHT", "720"))
FFMPEG = os.environ.get("FFMPEG_PATH") or imageio_ffmpeg.get_ffmpeg_exe()

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Video Upscale Service")


class UpscaleVideoRequest(BaseModel):
    video_filename: str = Field(min_length=1)
    scene_number: int = Field(ge=1)
    orientation: str = Field(default="landscape")
    target_width: int | None = Field(default=None, ge=480, le=3840)
    target_height: int | None = Field(default=None, ge=480, le=3840)


class UpscaleVideoResponse(BaseModel):
    filename: str
    videoPath: str
    width: int
    height: int


def run_ffmpeg(args: list[str]) -> None:
    command = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *args]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffmpeg failed")


def probe_video(path: Path) -> tuple[int, int]:
    command = [
        FFMPEG,
        "-hide_banner",
        "-i",
        str(path),
        "-f",
        "null",
        "-",
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    output = result.stderr or ""
    match = re.search(r"(\d{2,5})x(\d{2,5})", output)
    if not match:
        return (0, 0)
    return int(match.group(1)), int(match.group(2))


def resolve_target_dimensions(request: UpscaleVideoRequest) -> tuple[int, int]:
    if request.target_width and request.target_height:
        return request.target_width, request.target_height
    if request.orientation == "portrait":
        return 1080, 1920
    return TARGET_WIDTH, TARGET_HEIGHT


def build_upscale_filter(
    source_width: int,
    source_height: int,
    target_width: int,
    target_height: int,
) -> str:
    if source_width <= 0 or source_height <= 0:
        return (
            f"scale={target_width}:{target_height}:flags=lanczos,"
            f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2,"
            "setsar=1,unsharp=5:5:0.8:5:5:0.0"
        )

    return (
        f"scale={target_width}:{target_height}:force_original_aspect_ratio=decrease:flags=lanczos,"
        f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:black,"
        "setsar=1,unsharp=5:5:0.8:5:5:0.0"
    )


@app.on_event("startup")
def ensure_storage() -> None:
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(
        "Upscale service ready target=%sx%s ffmpeg=%s",
        TARGET_WIDTH,
        TARGET_HEIGHT,
        FFMPEG,
    )


@app.get("/health")
def health() -> dict[str, str | int]:
    return {
        "status": "ok",
        "targetWidth": TARGET_WIDTH,
        "targetHeight": TARGET_HEIGHT,
    }


@app.post("/upscale", response_model=UpscaleVideoResponse)
def upscale_video(request: UpscaleVideoRequest) -> UpscaleVideoResponse:
    source_path = VIDEO_DIR / request.video_filename
    if not source_path.is_file():
        raise HTTPException(
            status_code=400,
            detail=f"Video not found: {request.video_filename}",
        )

    source_width, source_height = probe_video(source_path)
    target_width, target_height = resolve_target_dimensions(request)
    filename = f"scene-{request.scene_number}-{uuid.uuid4().hex}-1080p.mp4"
    output_path = VIDEO_DIR / filename

    try:
        if (
            source_height >= MIN_UPSCALE_HEIGHT
            and source_width >= target_width - 200
        ):
            logger.info(
                "Scene %s already %sx%s — re-encoding to %sx%s",
                request.scene_number,
                source_width,
                source_height,
                target_width,
                target_height,
            )

        vf = build_upscale_filter(
            source_width,
            source_height,
            target_width,
            target_height,
        )
        run_ffmpeg(
            [
                "-i",
                str(source_path),
                "-vf",
                vf,
                "-c:v",
                "libx264",
                "-preset",
                os.environ.get("UPSCALE_X264_PRESET", "medium"),
                "-crf",
                os.environ.get("UPSCALE_CRF", "18"),
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )
    except Exception as exc:
        logger.exception("Upscale failed for scene %s", request.scene_number)
        if output_path.exists():
            output_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    out_width, out_height = probe_video(output_path)
    logger.info(
        "Upscaled scene %s -> %s (%sx%s)",
        request.scene_number,
        filename,
        out_width,
        out_height,
    )

    return UpscaleVideoResponse(
        filename=filename,
        videoPath=f"/videos/{filename}",
        width=out_width or target_width,
        height=out_height or target_height,
    )


if __name__ == "__main__":
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)
