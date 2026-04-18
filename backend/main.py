from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from dotenv import load_dotenv

# Load environments from the parent directory .env.local
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

from agents.orchestrator import execute_pipeline

app = FastAPI(
    title="GNOSIS Multi-Agent Backend",
    description="Python FastAPI backend orchestrating LangGraph agents for deep knowledge synthesis.",
    version="1.0.0"
)

# Allow CORS for localhost development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class IngestRequest(BaseModel):
    file_path: str
    domain_tag: str | None = None
    session_label: str
    enrichment_depth: str = "Standard"
    output_language: str = "en"

@app.get("/")
async def root():
    return {"message": "GNOSIS Multi-Agent Backend is live."}

@app.post("/api/v1/ingest")
async def ingest_document(req: IngestRequest, background_tasks: BackgroundTasks):
    # This will trigger the Orchestrator Agent in the background
    background_tasks.add_task(execute_pipeline, req.session_label)
    return {
        "status": "queued",
        "message": "GNOSIS document ingestion initiated asynchronously.",
        "params": req.dict()
    }

@app.get("/api/v1/status/{session_id}")
async def get_status(session_id: str):
    # Retrieve current stage from Supabase
    return {
        "session_id": session_id,
        "status": "processing",
        "current_agent": "Extraction Agent"
    }

class ResearchRequest(BaseModel):
    topic: str
    run_id: str | None = None

@app.post("/api/v1/research_topic")
async def research_topic(req: ResearchRequest):
    """Live 'Drill Deeper' enrichment for chat sessions."""
    try:
        from tavily import TavilyClient
        tavily_key = os.environ.get("TAVILY_API_KEY")
        if not tavily_key:
            raise HTTPException(status_code=500, detail="Tavily API key missing")
        
        tavily = TavilyClient(api_key=tavily_key)
        results = tavily.search(
            query=f"{req.topic} scholarly academic analysis",
            search_depth="advanced",
            max_results=3,
            include_answer=True
        )
        
        return {
            "status": "success",
            "topic": req.topic,
            "answer": results.get("answer", "No direct synthesis found."),
            "sources": [{"url": r["url"], "title": r["title"]} for r in results.get("results", [])]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/test_llm")
async def test_llm():
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0,
            api_key=os.environ.get("GEMINI_API_KEY")
        )
        msg = HumanMessage(content="Respond concisely: Are you successfully connected to the GNOSIS Multi-Agent python backend?")
        response = llm.invoke([msg])
        return {
            "status": "success",
            "model_response": response.content
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
