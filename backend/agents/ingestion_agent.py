"""
GNOSIS Ingestion Agent
Downloads documents from Supabase Storage, extracts text via Gemini,
chunks the text, embeds each chunk, and stores everything in the DB.
"""

import os
import base64
import asyncio
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

from lib.supabase_client import get_supabase
from lib.embeddings import batch_embed

MIME_MAP = {
    "pdf": "application/pdf",
    "epub": "application/epub+zip",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain",
    "md": "text/markdown",
    "html": "text/html",
}


def chunk_text(text: str, chunk_size: int = 1200, overlap: int = 150) -> list[str]:
    """Split text into overlapping chunks, filtering trivially short ones."""
    chunks = []
    i = 0
    while i < len(text):
        chunks.append(text[i : i + chunk_size])
        i += chunk_size - overlap
    return [c for c in chunks if len(c.strip()) > 30]


async def _extract_text_from_file(file_bytes: bytes, mime_type: str) -> str:
    """Use Gemini multimodal to extract all text from a binary document."""
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0,
        api_key=os.environ.get("GEMINI_API_KEY"),
    )
    b64 = base64.standard_b64encode(file_bytes).decode("utf-8")

    msg = HumanMessage(
        content=[
            {
                "type": "media",
                "mime_type": mime_type,
                "data": b64,
            },
            {
                "type": "text",
                "text": (
                    "You are a scholarly text extraction assistant. "
                    "Extract ALL text content from this document verbatim, "
                    "preserving paragraph structure, headings, footnotes, "
                    "and section markers. Do not summarize or skip any content. "
                    "Output plain text only."
                ),
            },
        ]
    )
    response = llm.invoke([msg])
    return response.content


async def run_ingestion(state: dict) -> dict:
    """
    Ingestion Agent entry point.
    Expects state with: run_id
    Produces: raw_text, chunks written to DB
    """
    run_id = state["run_id"]
    supabase = get_supabase()

    # Update run status
    supabase.table("runs").update({"status": "extracting", "current_stage": 1}).eq("id", run_id).execute()

    # Log audit
    supabase.table("audit_logs").insert({
        "run_id": run_id,
        "agent_name": "IngestionAgent",
        "action": "started",
        "details": {},
    }).execute()

    # Fetch documents for this run
    docs_resp = supabase.table("documents").select("*").eq("run_id", run_id).execute()
    docs = docs_resp.data or []
    if not docs:
        raise RuntimeError(f"No documents found for run {run_id}")

    all_texts = []

    for doc in docs:
        try:
            # Download from Supabase Storage
            file_bytes = supabase.storage.from_("corpus_documents").download(doc["file_path"])

            ext = (doc.get("file_type") or "pdf").lower()
            mime_type = MIME_MAP.get(ext, "application/octet-stream")

            # For plain text files, just decode directly
            if ext in ("txt", "md"):
                extracted = file_bytes.decode("utf-8", errors="replace")
            else:
                extracted = await _extract_text_from_file(file_bytes, mime_type)

            supabase.table("documents").update({"status": "extracted"}).eq("id", doc["id"]).execute()
            all_texts.append({"doc_id": doc["id"], "text": extracted})

        except Exception as e:
            print(f"[IngestionAgent] Error extracting {doc.get('filename')}: {e}")
            supabase.table("documents").update({
                "status": "error",
                "error_message": str(e),
            }).eq("id", doc["id"]).execute()

    if not all_texts:
        raise RuntimeError("All document extractions failed")

    combined_text = "\n\n---DOCUMENT BREAK---\n\n".join(t["text"] for t in all_texts)

    # Stage 2: Chunking + Embedding
    supabase.table("runs").update({"current_stage": 2}).eq("id", run_id).execute()

    for item in all_texts:
        chunks = chunk_text(item["text"])
        target_chunks = chunks[:200]  # cap at 200 chunks per doc

        if not target_chunks:
            continue

        # Embed all chunks
        embeddings = await batch_embed(target_chunks)

        # Insert in batches of 50
        for i in range(0, len(target_chunks), 50):
            batch = [
                {
                    "document_id": item["doc_id"],
                    "run_id": run_id,
                    "content": target_chunks[j],
                    "embedding": embeddings[j] if j < len(embeddings) else None,
                    "metadata": {
                        "chunk_index": j,
                        "total_chunks": len(chunks),
                        "source": "gnosis_ingestion",
                    },
                }
                for j in range(i, min(i + 50, len(target_chunks)))
            ]
            supabase.table("chunks").insert(batch).execute()

    supabase.table("runs").update({"current_stage": 3}).eq("id", run_id).execute()

    supabase.table("audit_logs").insert({
        "run_id": run_id,
        "agent_name": "IngestionAgent",
        "action": "completed",
        "details": {
            "documents_processed": len(all_texts),
            "total_text_length": len(combined_text),
        },
    }).execute()

    state["raw_text"] = combined_text
    return state
