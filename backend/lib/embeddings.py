"""
Gemini Embedding utilities for GNOSIS.
Mirrors the existing frontend embedding logic (768-dim, normalized vectors).
"""

import os
import math
import httpx

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIM = 768
BATCH_SIZE = 100


def _normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec))
    if norm == 0:
        return vec
    return [v / norm for v in vec]


async def batch_embed(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts using Gemini embedding API. Returns normalized 768-d vectors."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")

    all_embeddings: list[list[float]] = []

    async with httpx.AsyncClient(timeout=120) as client:
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]
            requests_body = [
                {
                    "model": f"models/{EMBEDDING_MODEL}",
                    "content": {"parts": [{"text": t}]},
                    "output_dimensionality": EMBEDDING_DIM,
                    "task_type": "RETRIEVAL_DOCUMENT",
                }
                for t in batch
            ]

            url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBEDDING_MODEL}:batchEmbedContents?key={api_key}"
            resp = await client.post(url, json={"requests": requests_body})
            resp.raise_for_status()
            data = resp.json()

            if "embeddings" not in data:
                raise RuntimeError(f"Unexpected embedding response: {data}")

            for emb in data["embeddings"]:
                all_embeddings.append(_normalize(emb.get("values", [])))

    return all_embeddings
