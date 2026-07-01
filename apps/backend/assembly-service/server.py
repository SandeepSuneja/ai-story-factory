import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import imageio_ffmpeg
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

HOST = os.environ.get("ASSEMBLY_HOST", "127.0.0.1")
PORT = int(os.environ.get("ASSEMBLY_PORT", "7863"))
VIDEO_DIR = Path(
    os.environ.get(
        "VIDEO_STORAGE_DIR",
        str(Path(__file__).resolve().parent.parent / "storage" / "videos"),
    )
)
AUDIO_DIR = Path(
    os.environ.get(
        "AUDIO_STORAGE_DIR",
        str(Path(__file__).resolve().parent.parent / "storage" / "audio"),
    )
)
FINAL_DIR = Path(
    os.environ.get(
        "FINAL_VIDEO_STORAGE_DIR",
        str(VIDEO_DIR),
    )
)
SUBTITLES_ENABLED = os.environ.get("ASSEMBLY_SUBTITLES", "true").lower() in {
    "1",
    "true",
    "yes",
}
SUBTITLE_FONT_SIZE = int(os.environ.get("ASSEMBLY_SUBTITLE_FONT_SIZE", "22"))
SUBTITLE_MARGIN_V = int(os.environ.get("ASSEMBLY_SUBTITLE_MARGIN_V", "72"))
FFMPEG = os.environ.get("FFMPEG_PATH") or imageio_ffmpeg.get_ffmpeg_exe()

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Assembly Service")


class SceneInput(BaseModel):
    scene_number: int = Field(ge=1)
    video_filename: str = Field(min_length=1)
    audio_filename: str = Field(min_length=1)
    narration: str = Field(min_length=1)
    duration_seconds: float | None = Field(default=None, ge=0.1)


class AssembleRequest(BaseModel):
    scenes: list[SceneInput] = Field(min_length=1)
    project_name: str | None = None


class AssembleResponse(BaseModel):
    filename: str
    finalVideoPath: str
    sceneCount: int
    durationSeconds: float


def run_ffmpeg(args: list[str]) -> None:
    command = [FFMPEG, "-hide_banner", "-loglevel", "error", *args]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffmpeg failed")


def probe_duration(path: Path) -> float:
    command = [
        FFMPEG,
        "-hide_banner",
        "-i",
        str(path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    output = f"{result.stderr}\n{result.stdout}"
    for line in output.splitlines():
        if "Duration:" in line:
            time_part = line.split("Duration:", 1)[1].split(",", 1)[0].strip()
            hours, minutes, seconds = time_part.split(":")
            return (int(hours) * 3600) + (int(minutes) * 60) + float(seconds)
    raise RuntimeError(f"Could not read duration for {path.name}")


def resolve_filename(path_value: str) -> str:
    normalized = path_value.replace("\\", "/").split("/")[-1]
    if not normalized:
        raise ValueError(f"Invalid media path: {path_value}")
    return normalized


def format_srt_timestamp(seconds: float) -> str:
    total_ms = max(0, int(round(seconds * 1000)))
    hours = total_ms // 3_600_000
    minutes = (total_ms % 3_600_000) // 60_000
    secs = (total_ms % 60_000) // 1000
    millis = total_ms % 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def wrap_subtitle_text(text: str, width: int = 38) -> str:
    words = text.split()
    if not words:
        return text.strip()

    lines: list[str] = []
    current: list[str] = []
    for word in words:
        candidate = " ".join([*current, word])
        if len(candidate) <= width:
            current.append(word)
            continue
        if current:
            lines.append(" ".join(current))
        current = [word]

    if current:
        lines.append(" ".join(current))
    return "\n".join(lines)


def write_scene_srt(narration: str, duration_seconds: float, output_path: Path) -> None:
    end_seconds = max(duration_seconds - 0.05, 0.1)
    body = wrap_subtitle_text(narration.strip())
    content = (
        "1\n"
        f"{format_srt_timestamp(0.0)} --> {format_srt_timestamp(end_seconds)}\n"
        f"{body}\n"
    )
    output_path.write_text(content, encoding="utf-8")


def escape_subtitles_filter_path(path: Path) -> str:
    return str(path.resolve()).replace("\\", "/").replace(":", "\\:")


def subtitle_force_style() -> str:
    return (
        f"Alignment=2,MarginV={SUBTITLE_MARGIN_V},Fontsize={SUBTITLE_FONT_SIZE},"
        "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,"
        "Outline=2,Shadow=1,Bold=1"
    )


def mux_scene(
    video_path: Path,
    audio_path: Path,
    output_path: Path,
    narration: str | None = None,
    work_dir: Path | None = None,
) -> None:
    video_duration = probe_duration(video_path)
    filter_parts = [
        f"[1:a]apad=whole_dur={video_duration:.3f},"
        f"atrim=0:{video_duration:.3f},"
        "asetpts=PTS-STARTPTS[aout]",
    ]
    video_map = "0:v:0"
    video_codec = ["-c:v", "copy"]

    if SUBTITLES_ENABLED and narration and narration.strip() and work_dir is not None:
        subtitle_path = work_dir / f"scene-{output_path.stem}.srt"
        write_scene_srt(narration, video_duration, subtitle_path)
        subs_arg = escape_subtitles_filter_path(subtitle_path)
        style = subtitle_force_style()
        filter_parts.insert(
            0,
            f"[0:v]subtitles='{subs_arg}':force_style='{style}'[vout]",
        )
        video_map = "[vout]"
        video_codec = ["-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p"]

    run_ffmpeg(
        [
            "-y",
            "-i",
            str(video_path),
            "-i",
            str(audio_path),
            "-filter_complex",
            ";".join(filter_parts),
            "-map",
            video_map,
            "-map",
            "[aout]",
            *video_codec,
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            "-shortest",
            str(output_path),
        ]
    )


def concat_scenes(segment_paths: list[Path], output_path: Path) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as handle:
        list_path = Path(handle.name)
        for segment in segment_paths:
            escaped = str(segment.resolve()).replace("'", "'\\''")
            handle.write(f"file '{escaped}'\n")

    try:
        run_ffmpeg(
            [
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(list_path),
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )
    finally:
        list_path.unlink(missing_ok=True)


@app.on_event("startup")
def startup() -> None:
    FINAL_DIR.mkdir(parents=True, exist_ok=True)
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    if not shutil.which(FFMPEG) and not Path(FFMPEG).is_file():
        logger.warning("ffmpeg not found at %s", FFMPEG)

    logger.info("Assembly service ready ffmpeg=%s output=%s", FFMPEG, FINAL_DIR)
    logger.info(
        "Subtitles enabled=%s font_size=%s margin_v=%s",
        SUBTITLES_ENABLED,
        SUBTITLE_FONT_SIZE,
        SUBTITLE_MARGIN_V,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "ffmpeg": FFMPEG}


@app.post("/assemble", response_model=AssembleResponse)
def assemble_video(request: AssembleRequest) -> AssembleResponse:
    ordered_scenes = sorted(request.scenes, key=lambda scene: scene.scene_number)
    temp_dir = Path(tempfile.mkdtemp(prefix="story-assembly-"))
    muxed_segments: list[Path] = []

    try:
        for scene in ordered_scenes:
            video_path = VIDEO_DIR / resolve_filename(scene.video_filename)
            audio_path = AUDIO_DIR / resolve_filename(scene.audio_filename)

            if not video_path.is_file():
                raise HTTPException(
                    status_code=400,
                    detail=f"Video not found: {scene.video_filename}",
                )
            if not audio_path.is_file():
                raise HTTPException(
                    status_code=400,
                    detail=f"Audio not found: {scene.audio_filename}",
                )

            muxed_path = temp_dir / f"scene-{scene.scene_number}-muxed.mp4"
            logger.info(
                "Muxing scene %s video=%s audio=%s subtitles=%s",
                scene.scene_number,
                video_path.name,
                audio_path.name,
                SUBTITLES_ENABLED,
            )
            mux_scene(
                video_path,
                audio_path,
                muxed_path,
                narration=scene.narration,
                work_dir=temp_dir,
            )
            muxed_segments.append(muxed_path)

        slug = uuid.uuid4().hex
        if request.project_name:
            safe_name = "".join(
                char if char.isalnum() else "-"
                for char in request.project_name.strip().lower()
            ).strip("-")[:40]
            filename = f"final-{safe_name}-{slug}.mp4" if safe_name else f"final-{slug}.mp4"
        else:
            filename = f"final-{slug}.mp4"

        output_path = FINAL_DIR / filename
        concat_scenes(muxed_segments, output_path)
        duration = probe_duration(output_path)

        return AssembleResponse(
            filename=filename,
            finalVideoPath=f"/videos/{filename}",
            sceneCount=len(ordered_scenes),
            durationSeconds=duration,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Assembly failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)
