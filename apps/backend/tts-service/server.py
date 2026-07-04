import asyncio
import logging
import os
import subprocess
import uuid
from pathlib import Path

import imageio_ffmpeg
import numpy as np
import soundfile as sf
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

HOST = os.environ.get("TTS_HOST", "127.0.0.1")
PORT = int(os.environ.get("TTS_PORT", "7862"))
AUDIO_DIR = Path(
    os.environ.get(
        "AUDIO_STORAGE_DIR",
        str(Path(__file__).resolve().parent.parent / "storage" / "audio"),
    )
)
BACKEND = os.environ.get("TTS_BACKEND", "auto").lower()
KOKORO_VOICE = os.environ.get("TTS_KOKORO_VOICE", "af_heart")
EDGE_VOICE = os.environ.get("TTS_EDGE_VOICE", "en-US-AriaNeural")
EDGE_VOICE_HI = os.environ.get("TTS_EDGE_VOICE_HI", "hi-IN-SwaraNeural")
SAMPLE_RATE = int(os.environ.get("TTS_SAMPLE_RATE", "24000"))
DIALOGUE_GAP_SECONDS = float(os.environ.get("TTS_DIALOGUE_GAP_SECONDS", "0.25"))
FFMPEG = os.environ.get("FFMPEG_PATH") or imageio_ffmpeg.get_ffmpeg_exe()

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="TTS Service")
active_backend = "uninitialized"
kokoro_pipeline = None


def resolve_backend() -> str:
    if BACKEND != "auto":
        return BACKEND

    try:
        import kokoro  # noqa: F401

        return "kokoro"
    except ImportError:
        logger.warning("kokoro not installed; falling back to edge-tts")

    return "edge"


def load_kokoro_pipeline():
    from kokoro import KPipeline

    return KPipeline(lang_code="a")


def synthesize_kokoro(text: str, output_path: Path, voice: str = KOKORO_VOICE) -> None:
    global kokoro_pipeline
    if kokoro_pipeline is None:
        kokoro_pipeline = load_kokoro_pipeline()

    chunks: list[np.ndarray] = []
    for _graphemes, _phonemes, audio in kokoro_pipeline(text, voice=voice):
        if audio is None:
            continue
        chunks.append(np.asarray(audio, dtype=np.float32))

    if not chunks:
        raise RuntimeError("Kokoro returned no audio")

    waveform = np.concatenate(chunks)
    sf.write(str(output_path), waveform, SAMPLE_RATE)


async def synthesize_edge(
    text: str,
    output_path: Path,
    voice: str = EDGE_VOICE,
) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output_path))


def resolve_request_backend(language: str) -> tuple[str, str]:
    lang = language.strip().lower()
    if lang == "hi":
        return "edge", EDGE_VOICE_HI
    if active_backend == "kokoro":
        return "kokoro", KOKORO_VOICE
    return "edge", EDGE_VOICE


def synthesize_with_backend(
    text: str,
    output_path: Path,
    language: str = "en",
    voice: str | None = None,
) -> tuple[str, str]:
    backend, default_voice = resolve_request_backend(language)
    selected_voice = voice or default_voice

    if selected_voice and (
        "Neural" in selected_voice
        or selected_voice.startswith("en-US-")
        or selected_voice.startswith("hi-IN-")
    ):
        asyncio.run(synthesize_edge(text, output_path, selected_voice))
        return "edge", selected_voice

    if backend == "kokoro":
        synthesize_kokoro(text, output_path, selected_voice)
        return backend, selected_voice

    asyncio.run(synthesize_edge(text, output_path, selected_voice))
    return backend, selected_voice


class GenerateAudioRequest(BaseModel):
    text: str = Field(min_length=1)
    scene_number: int = Field(ge=1)
    language: str = Field(default="en")
    voice: str | None = None


class DialogueLineInput(BaseModel):
    text: str = Field(min_length=1)
    voice: str = Field(min_length=1)
    speaker: str = Field(min_length=1)
    characterId: str | None = None


class GenerateDialogueRequest(BaseModel):
    scene_number: int = Field(ge=1)
    language: str = Field(default="en")
    lines: list[DialogueLineInput] = Field(min_length=1)


class SubtitleCueResponse(BaseModel):
    start: float
    end: float
    text: str


class DialogueSegmentResponse(BaseModel):
    characterId: str | None = None
    speaker: str
    text: str
    voice: str
    start: float
    end: float


class GenerateDialogueResponse(BaseModel):
    filename: str
    audioPath: str
    backend: str
    durationSeconds: float
    subtitleCues: list[SubtitleCueResponse]
    dialogueSegments: list[DialogueSegmentResponse]


class GenerateAudioResponse(BaseModel):
    filename: str
    audioPath: str
    backend: str
    durationSeconds: float


def probe_duration(path: Path) -> float:
    result = subprocess.run(
        [FFMPEG, "-hide_banner", "-i", str(path)],
        capture_output=True,
        text=True,
    )
    output = f"{result.stderr}\n{result.stdout}"
    for line in output.splitlines():
        if "Duration:" in line:
            time_part = line.split("Duration:", 1)[1].split(",", 1)[0].strip()
            hours, minutes, seconds = time_part.split(":")
            return (int(hours) * 3600) + (int(minutes) * 60) + float(seconds)
    raise RuntimeError(f"Could not read duration for {path.name}")


def run_ffmpeg(args: list[str]) -> None:
    command = [FFMPEG, "-hide_banner", "-loglevel", "error", *args]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffmpeg failed")


def concat_with_gaps(segment_paths: list[Path], output_path: Path, gap_seconds: float) -> float:
    if len(segment_paths) == 1:
        output_path.write_bytes(segment_paths[0].read_bytes())
        return probe_duration(output_path)

    temp_dir = output_path.parent
    list_path = temp_dir / f"concat-{uuid.uuid4().hex}.txt"
    silence_path = temp_dir / f"gap-{uuid.uuid4().hex}.wav"

    run_ffmpeg(
        [
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"anullsrc=r={SAMPLE_RATE}:cl=mono",
            "-t",
            f"{gap_seconds:.3f}",
            str(silence_path),
        ]
    )

    entries: list[str] = []
    for index, segment_path in enumerate(segment_paths):
        escaped = str(segment_path.resolve()).replace("'", "'\\''")
        entries.append(f"file '{escaped}'")
        if index < len(segment_paths) - 1:
            escaped_gap = str(silence_path.resolve()).replace("'", "'\\''")
            entries.append(f"file '{escaped_gap}'")

    list_path.write_text("\n".join(entries), encoding="utf-8")

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
            str(output_path),
        ]
    )

    list_path.unlink(missing_ok=True)
    silence_path.unlink(missing_ok=True)
    return probe_duration(output_path)

@app.on_event("startup")
def startup() -> None:
    global active_backend, kokoro_pipeline

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    active_backend = resolve_backend()

    if active_backend == "kokoro":
        try:
            kokoro_pipeline = load_kokoro_pipeline()
        except Exception:
            logger.exception("Failed to initialize Kokoro; falling back to edge-tts")
            active_backend = "edge"
            kokoro_pipeline = None

    logger.info(
        "TTS service ready backend=%s voice=%s sample_rate=%s",
        active_backend,
        KOKORO_VOICE if active_backend == "kokoro" else EDGE_VOICE,
        SAMPLE_RATE,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "backend": active_backend,
        "voice": KOKORO_VOICE if active_backend == "kokoro" else EDGE_VOICE,
    }


@app.post("/generate", response_model=GenerateAudioResponse)
def generate_audio(request: GenerateAudioRequest) -> GenerateAudioResponse:
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is empty")

    backend_for_request, _voice = resolve_request_backend(request.language)
    extension = ".wav" if backend_for_request == "kokoro" else ".mp3"
    filename = f"scene-{request.scene_number}-{uuid.uuid4().hex}{extension}"
    output_path = AUDIO_DIR / filename

    try:
        backend_used, _voice_used = synthesize_with_backend(
            text,
            output_path,
            request.language,
            request.voice,
        )
    except Exception as exc:
        logger.exception("TTS failed for scene %s", request.scene_number)
        if output_path.exists():
            output_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    try:
        duration = probe_duration(output_path)
    except Exception:
        duration = max(len(text.split()) / 2.5, 1.0)

    return GenerateAudioResponse(
        filename=filename,
        audioPath=f"/audio/{filename}",
        backend=backend_used,
        durationSeconds=duration,
    )


@app.post("/generate/dialogue", response_model=GenerateDialogueResponse)
def generate_dialogue(request: GenerateDialogueRequest) -> GenerateDialogueResponse:
    if not request.lines:
        raise HTTPException(status_code=400, detail="Dialogue lines are empty")

    backend_for_request, _ = resolve_request_backend(request.language)
    extension = ".wav" if backend_for_request == "kokoro" else ".mp3"
    filename = f"scene-{request.scene_number}-{uuid.uuid4().hex}{extension}"
    output_path = AUDIO_DIR / filename

    segment_paths: list[Path] = []
    subtitle_cues: list[SubtitleCueResponse] = []
    dialogue_segments: list[DialogueSegmentResponse] = []
    timeline = 0.0
    backend_used = backend_for_request

    try:
        for index, line in enumerate(request.lines):
            segment_path = AUDIO_DIR / f"scene-{request.scene_number}-line-{index}-{uuid.uuid4().hex}{extension}"
            backend_used, _voice_used = synthesize_with_backend(
                line.text.strip(),
                segment_path,
                request.language,
                line.voice,
            )
            segment_duration = probe_duration(segment_path)
            cue_text = f"{line.speaker}: {line.text.strip()}"
            segment_start = timeline
            segment_end = timeline + max(segment_duration - 0.05, 0.1)
            subtitle_cues.append(
                SubtitleCueResponse(
                    start=segment_start,
                    end=segment_end,
                    text=cue_text,
                )
            )
            dialogue_segments.append(
                DialogueSegmentResponse(
                    characterId=line.characterId,
                    speaker=line.speaker,
                    text=line.text.strip(),
                    voice=line.voice,
                    start=segment_start,
                    end=segment_end,
                )
            )
            timeline += segment_duration
            if index < len(request.lines) - 1:
                timeline += DIALOGUE_GAP_SECONDS
            segment_paths.append(segment_path)

        concat_with_gaps(segment_paths, output_path, DIALOGUE_GAP_SECONDS)
    except Exception as exc:
        logger.exception("Dialogue TTS failed for scene %s", request.scene_number)
        if output_path.exists():
            output_path.unlink(missing_ok=True)
        for segment_path in segment_paths:
            segment_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        for segment_path in segment_paths:
            segment_path.unlink(missing_ok=True)

    try:
        duration = probe_duration(output_path)
    except Exception:
        duration = timeline

    return GenerateDialogueResponse(
        filename=filename,
        audioPath=f"/audio/{filename}",
        backend=backend_used,
        durationSeconds=duration,
        subtitleCues=subtitle_cues,
        dialogueSegments=dialogue_segments,
    )


if __name__ == "__main__":
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)
