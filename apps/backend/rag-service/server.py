from __future__ import annotations

import logging
import os
import re
import uuid
from pathlib import Path
from typing import Any

import chromadb
import uvicorn
from chromadb.utils import embedding_functions
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

HOST = os.environ.get("RAG_HOST", "127.0.0.1")
PORT = int(os.environ.get("RAG_PORT", "8091"))
STORAGE_DIR = Path(
    os.environ.get(
        "RAG_STORAGE_DIR",
        str(Path(__file__).resolve().parent.parent / "storage" / "rag" / "chroma"),
    )
)
EMBEDDING_MODEL = os.environ.get(
    "RAG_EMBEDDING_MODEL",
    "sentence-transformers/all-MiniLM-L6-v2",
)
DEFAULT_TOP_K = int(os.environ.get("RAG_DEFAULT_TOP_K", "6"))
CHUNK_SIZE = int(os.environ.get("RAG_CHUNK_SIZE", "900"))
CHUNK_OVERLAP = int(os.environ.get("RAG_CHUNK_OVERLAP", "120"))

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="RAG Knowledge Service")
client: chromadb.PersistentClient | None = None
embedding_fn: embedding_functions.SentenceTransformerEmbeddingFunction | None = None


class CreateCollectionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class CollectionResponse(BaseModel):
    id: str
    name: str
    description: str
    document_count: int
    chunk_count: int


class DocumentInput(BaseModel):
    id: str | None = None
    text: str = Field(min_length=1)
    title: str | None = None
    metadata: dict[str, Any] | None = None


class IndexDocumentsRequest(BaseModel):
    documents: list[DocumentInput] = Field(min_length=1)


class SearchRequest(BaseModel):
    collection_id: str
    query: str = Field(min_length=1)
    top_k: int = Field(default=DEFAULT_TOP_K, ge=1, le=20)


class SearchHit(BaseModel):
    id: str
    text: str
    score: float
    metadata: dict[str, Any]


class SearchResponse(BaseModel):
    collection_id: str
    query: str
    hits: list[SearchHit]


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def split_text(text: str) -> list[str]:
    cleaned = text.replace("\r\n", "\n").strip()
    if not cleaned:
        return []

    paragraphs = [part.strip() for part in re.split(r"\n\s*\n+", cleaned) if part.strip()]
    chunks: list[str] = []
    buffer = ""

    def flush_buffer() -> None:
        nonlocal buffer
        if buffer.strip():
            chunks.append(buffer.strip())
        buffer = ""

    for paragraph in paragraphs:
        if len(paragraph) <= CHUNK_SIZE:
            candidate = f"{buffer}\n\n{paragraph}".strip() if buffer else paragraph
            if len(candidate) <= CHUNK_SIZE:
                buffer = candidate
            else:
                flush_buffer()
                buffer = paragraph
            continue

        flush_buffer()
        start = 0
        while start < len(paragraph):
            end = min(start + CHUNK_SIZE, len(paragraph))
            piece = paragraph[start:end].strip()
            if piece:
                chunks.append(piece)
            if end >= len(paragraph):
                break
            start = max(end - CHUNK_OVERLAP, start + 1)

    flush_buffer()
    return chunks


def get_client() -> chromadb.PersistentClient:
    if client is None:
        raise HTTPException(status_code=503, detail="RAG service is still starting")
    return client


def get_collection(collection_id: str):
    try:
        return get_client().get_collection(
            name=collection_id,
            embedding_function=embedding_fn,
        )
    except Exception as error:
        raise HTTPException(
            status_code=404,
            detail=f"Collection {collection_id} not found",
        ) from error


def collection_stats(collection_id: str) -> tuple[int, int]:
    collection = get_collection(collection_id)
    total_chunks = collection.count()
    result = collection.get(include=["metadatas"])
    document_ids = {
        metadata.get("document_id")
        for metadata in (result.get("metadatas") or [])
        if metadata and metadata.get("document_id")
    }
    return len(document_ids), total_chunks


def to_collection_response(
    collection_id: str,
    name: str,
    description: str,
) -> CollectionResponse:
    document_count, chunk_count = collection_stats(collection_id)
    return CollectionResponse(
        id=collection_id,
        name=name,
        description=description,
        document_count=document_count,
        chunk_count=chunk_count,
    )


@app.on_event("startup")
def startup() -> None:
    global client, embedding_fn

    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Loading embedding model %s", EMBEDDING_MODEL)
    embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=EMBEDDING_MODEL,
    )
    client = chromadb.PersistentClient(path=str(STORAGE_DIR))
    logger.info("RAG service ready (storage=%s)", STORAGE_DIR)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok" if client is not None else "starting",
        "embedding_model": EMBEDDING_MODEL,
    }


@app.get("/collections", response_model=list[CollectionResponse])
def list_collections() -> list[CollectionResponse]:
    chroma = get_client()
    collections: list[CollectionResponse] = []
    for item in chroma.list_collections():
        metadata = item.metadata or {}
        collections.append(
            to_collection_response(
                item.name,
                metadata.get("display_name", item.name),
                metadata.get("description", ""),
            )
        )
    return collections


@app.post("/collections", response_model=CollectionResponse)
def create_collection(body: CreateCollectionRequest) -> CollectionResponse:
    chroma = get_client()
    collection_id = str(uuid.uuid4())
    chroma.create_collection(
        name=collection_id,
        embedding_function=embedding_fn,
        metadata={
            "display_name": body.name.strip(),
            "description": body.description.strip(),
        },
    )
    return to_collection_response(
        collection_id,
        body.name.strip(),
        body.description.strip(),
    )


@app.get("/collections/{collection_id}", response_model=CollectionResponse)
def get_collection_info(collection_id: str) -> CollectionResponse:
    collection = get_collection(collection_id)
    metadata = collection.metadata or {}
    return to_collection_response(
        collection_id,
        metadata.get("display_name", collection_id),
        metadata.get("description", ""),
    )


@app.delete("/collections/{collection_id}", status_code=204)
def delete_collection(collection_id: str) -> None:
    get_client().delete_collection(name=collection_id)


@app.post("/collections/{collection_id}/documents", response_model=CollectionResponse)
def index_documents(
    collection_id: str,
    body: IndexDocumentsRequest,
) -> CollectionResponse:
    collection = get_collection(collection_id)
    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict[str, Any]] = []

    for item in body.documents:
        document_id = item.id or str(uuid.uuid4())
        title = (item.title or f"Document {document_id[:8]}").strip()
        chunks = split_text(item.text)
        if not chunks:
            continue

        for index, chunk in enumerate(chunks):
            chunk_id = f"{document_id}:{index}"
            ids.append(chunk_id)
            documents.append(chunk)
            metadata = {
                "document_id": document_id,
                "document_title": title,
                "chunk_index": index,
                "chunk_count": len(chunks),
            }
            if item.metadata:
                metadata.update(item.metadata)
            metadatas.append(metadata)

    if not ids:
        raise HTTPException(status_code=400, detail="No indexable text found")

    collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
    metadata = collection.metadata or {}
    return to_collection_response(
        collection_id,
        metadata.get("display_name", collection_id),
        metadata.get("description", ""),
    )


@app.post("/collections/{collection_id}/upload", response_model=CollectionResponse)
async def upload_document(
    collection_id: str,
    file: UploadFile = File(...),
    title: str | None = None,
) -> CollectionResponse:
    raw = await file.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise HTTPException(
            status_code=400,
            detail="Only UTF-8 text files are supported",
        ) from error

    document_title = title or (file.filename or "Uploaded document").strip()
    return index_documents(
        collection_id,
        IndexDocumentsRequest(
            documents=[
                DocumentInput(
                    text=text,
                    title=document_title,
                    metadata={"source_filename": file.filename or document_title},
                )
            ]
        ),
    )


@app.post("/search", response_model=SearchResponse)
def search(body: SearchRequest) -> SearchResponse:
    collection = get_collection(body.collection_id)
    result = collection.query(
        query_texts=[normalize_whitespace(body.query)],
        n_results=body.top_k,
        include=["documents", "metadatas", "distances"],
    )

    hits: list[SearchHit] = []
    ids = result.get("ids") or [[]]
    documents = result.get("documents") or [[]]
    metadatas = result.get("metadatas") or [[]]
    distances = result.get("distances") or [[]]

    for index, chunk_id in enumerate(ids[0]):
        distance = distances[0][index] if distances[0] else 1.0
        score = max(0.0, 1.0 - float(distance))
        hits.append(
            SearchHit(
                id=chunk_id,
                text=documents[0][index] or "",
                score=score,
                metadata=metadatas[0][index] or {},
            )
        )

    return SearchResponse(
        collection_id=body.collection_id,
        query=body.query,
        hits=hits,
    )


if __name__ == "__main__":
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)
