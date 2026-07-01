import logging
import os
import re
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from llama_cpp import Llama
from pydantic import BaseModel, Field

MODEL_REPO = os.environ.get(
    "QWEN_MODEL_REPO",
    "Aldaris/Qwen3-14B-Q4_K_M-GGUF",
)
MODEL_FILE = os.environ.get("QWEN_MODEL_FILE", "qwen3-14b-q4_k_m.gguf")
MODEL_PATH = os.environ.get("QWEN_MODEL_PATH", "").strip()
HOST = os.environ.get("QWEN_HOST", "127.0.0.1")
PORT = int(os.environ.get("QWEN_PORT", "8090"))
MAX_NEW_TOKENS = int(os.environ.get("QWEN_MAX_NEW_TOKENS", "2048"))
TEMPERATURE = float(os.environ.get("QWEN_TEMPERATURE", "0.7"))
TOP_P = float(os.environ.get("QWEN_TOP_P", "0.8"))
CONTEXT_SIZE = int(os.environ.get("QWEN_CONTEXT_SIZE", "8192"))
N_GPU_LAYERS = int(os.environ.get("QWEN_N_GPU_LAYERS", "-1"))
ENABLE_THINKING = os.environ.get("QWEN_ENABLE_THINKING", "false").lower() in {
    "1",
    "true",
    "yes",
}

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Qwen Text Service")
llm: Llama | None = None
model_label = f"{MODEL_REPO}/{MODEL_FILE}"


def strip_thinking(text: str) -> str:
    open_marker = "<" + "redacted_thinking" + ">"
    close_marker = "</" + "redacted_thinking" + ">"
    pattern = re.escape(open_marker) + r".*?" + re.escape(close_marker)
    cleaned = re.sub(pattern, "", text, flags=re.DOTALL | re.IGNORECASE)
    if open_marker in cleaned:
        cleaned = cleaned.split(open_marker, 1)[0]

    think_open = "<" + "think" + ">"
    think_close = "</" + "think" + ">"
    think_pattern = re.escape(think_open) + r".*?" + re.escape(think_close)
    cleaned = re.sub(think_pattern, "", cleaned, flags=re.DOTALL | re.IGNORECASE)
    if think_open in cleaned:
        cleaned = cleaned.split(think_open, 1)[0]

    return cleaned.strip()


def build_user_content(prompt: str) -> str:
    if ENABLE_THINKING:
        return prompt
    return f"{prompt} /no_think"


def resolve_model_source() -> str | Path:
    if MODEL_PATH:
        path = Path(MODEL_PATH)
        if not path.is_file():
            raise FileNotFoundError(f"QWEN_MODEL_PATH does not exist: {path}")
        return path
    return MODEL_REPO


@app.on_event("startup")
def load_model() -> None:
    global llm, model_label

    source = resolve_model_source()
    logger.info(
        "Loading Qwen3-14B Q4_K_M GGUF from %s (file=%s, n_gpu_layers=%s)",
        source,
        MODEL_FILE,
        N_GPU_LAYERS,
    )

    if isinstance(source, Path):
        llm = Llama(
            model_path=str(source),
            n_ctx=CONTEXT_SIZE,
            n_gpu_layers=N_GPU_LAYERS,
            verbose=False,
        )
        model_label = str(source)
    else:
        llm = Llama.from_pretrained(
            repo_id=MODEL_REPO,
            filename=MODEL_FILE,
            n_ctx=CONTEXT_SIZE,
            n_gpu_layers=N_GPU_LAYERS,
            verbose=False,
        )
        model_label = f"{MODEL_REPO}/{MODEL_FILE}"

    logger.info("Qwen GGUF model ready")


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1)
    max_tokens: int | None = Field(default=None, ge=64, le=8192)


class GenerateResponse(BaseModel):
    text: str


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "model": model_label,
        "quantization": "Q4_K_M",
    }


@app.post("/generate", response_model=GenerateResponse)
def generate_text(request: GenerateRequest) -> GenerateResponse:
    if llm is None:
        raise HTTPException(status_code=503, detail="Qwen model is not ready")

    max_tokens = request.max_tokens or MAX_NEW_TOKENS

    response = llm.create_chat_completion(
        messages=[
            {
                "role": "user",
                "content": build_user_content(request.prompt),
            }
        ],
        max_tokens=max_tokens,
        temperature=TEMPERATURE,
        top_p=TOP_P,
    )

    choice = response["choices"][0]
    message = choice.get("message") or {}
    text = message.get("content") or choice.get("text") or ""
    return GenerateResponse(text=strip_thinking(text))


if __name__ == "__main__":
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)
