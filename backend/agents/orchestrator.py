"""
GNOSIS Orchestrator
Uses LangGraph to define and execute the state machine pipeline:
Ingestion -> Extraction -> Research -> Synthesis -> Document.
"""

from typing import TypedDict, Any, Dict, List
from langgraph.graph import StateGraph, END
import asyncio

# Import individual agent nodes
from agents.ingestion_agent import run_ingestion
from agents.extraction_agent import run_extraction
from agents.research_agent import run_research
from agents.synthesis_agent import run_synthesis
from agents.document_agent import run_document_generation

class GnosisState(TypedDict):
    """The state dictionary passed through the LangGraph timeline."""
    run_id: str
    
    # Internal agent pipeline variables
    raw_text: str
    concepts: List[Dict[str, Any]]
    domain_detected: str
    executive_summary: str
    enrichments: List[Dict[str, Any]]
    synthesis_document: Dict[str, Any]
    pdf_path: str


def build_graph() -> StateGraph:
    """Configures the LangGraph edges and nodes."""
    workflow = StateGraph(GnosisState)

    # Add Nodes
    workflow.add_node("ingest", run_ingestion)
    workflow.add_node("extract", run_extraction)
    workflow.add_node("research", run_research)
    workflow.add_node("synthesize", run_synthesis)
    workflow.add_node("document", run_document_generation)

    # Define Graph Flow
    workflow.set_entry_point("ingest")
    workflow.add_edge("ingest", "extract")
    workflow.add_edge("extract", "research")
    workflow.add_edge("research", "synthesize")
    workflow.add_edge("synthesize", "document")
    workflow.add_edge("document", END)

    return workflow.compile()


async def execute_pipeline(run_id: str):
    """
    Entry point for the FastAPI background task.
    Initializes the state and fires the graph executor.
    """
    print(f"[Orchestrator] Starting GNOSIS Pipeline for run: {run_id}")
    
    app = build_graph()
    initial_state = {
        "run_id": run_id,
        "raw_text": "",
        "concepts": [],
        "domain_detected": "",
        "executive_summary": "",
        "enrichments": [],
        "synthesis_document": {},
        "pdf_path": "",
    }
    
    # Execute the graph
    # Depending on LangGraph version, invoke or ainvoke might be available.
    try:
        final_state = await app.ainvoke(initial_state)
        print(f"[Orchestrator] Pipeline completed successfully for run: {run_id}")
        return final_state
    except Exception as e:
        print(f"[Orchestrator] Pipeline failed: {e}")
        # Mark as failed in Supabase so frontend knows
        from lib.supabase_client import get_supabase
        supabase = get_supabase()
        supabase.table("runs").update({
            "status": "failed",
            "error_message": str(e)
        }).eq("id", run_id).execute()
        return None
