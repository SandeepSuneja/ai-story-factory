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


def synthesize_kokoro(text: str, output_path: Path) -> None:
    global kokoro_pipeline
    if kokoro_pipeline is None:
        kokoro_pipeline = load_kokoro_pipeline()

    chunks: list[np.ndarray] = []
    for _graphemes, _phonemes, audio in kokoro_pipeline(text, voice=KOKORO_VOICE):
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
) -> tuple[str, str]:
    backend, voice = resolve_request_backend(language)

    if backend == "kokoro":
        synthesize_kokoro(text, output_path)
        return backend, KOKORO_VOICE

    asyncio.run(synthesize_edge(text, output_path, voice))
    return backend, voice


class GenerateAudioRequest(BaseModel):
    text: str = Field(min_length=1)
    scene_number: int = Field(ge=1)
    language: str = Field(default="en")


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


if __name__ == "__main__":
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)
