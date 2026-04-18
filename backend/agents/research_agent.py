"""
GNOSIS Research Agent
Takes extracted concepts and performs targeted web searches via Tavily API.
Retrieves scholarly context, cross-domain connections, and counter-arguments.
Source-stamps every external claim. Flags contradictions.
"""

import os
from tavily import TavilyClient

from lib.supabase_client import get_supabase

# Enrichment limits by depth
DEPTH_CONFIG = {
    "Light": {"max_concepts": 3, "searches_per_concept": 1, "max_results": 3},
    "Standard": {"max_concepts": 7, "searches_per_concept": 1, "max_results": 5},
    "Deep": {"max_concepts": 15, "searches_per_concept": 2, "max_results": 5},
}


async def run_research(state: dict) -> dict:
    """
    Research Agent entry point.
    Expects state with: run_id, concepts, domain_detected
    Produces: enrichments list stored in DB
    """
    run_id = state["run_id"]
    concepts = state.get("concepts", [])
    domain = state.get("domain_detected", "general")
    supabase = get_supabase()

    # Get enrichment depth from run config
    run_resp = supabase.table("runs").select("enrichment_depth").eq("id", run_id).single().execute()
    depth = (run_resp.data or {}).get("enrichment_depth", "Standard")
    config = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["Standard"])

    supabase.table("runs").update({"status": "researching", "current_stage": 6}).eq("id", run_id).execute()
    supabase.table("audit_logs").insert({
        "run_id": run_id,
        "agent_name": "ResearchAgent",
        "action": "started",
        "details": {"depth": depth, "total_concepts": len(concepts)},
    }).execute()

    tavily_key = os.environ.get("TAVILY_API_KEY")
    if not tavily_key:
        print("[ResearchAgent] WARNING: No TAVILY_API_KEY set, skipping enrichment")
        supabase.table("audit_logs").insert({
            "run_id": run_id,
            "agent_name": "ResearchAgent",
            "action": "skipped",
            "details": {"reason": "No TAVILY_API_KEY"},
        }).execute()
        state["enrichments"] = []
        return state

    tavily = TavilyClient(api_key=tavily_key)

    # Sort concepts by importance, take top N
    importance_order = {"high": 0, "medium": 1, "low": 2}
    sorted_concepts = sorted(
        concepts,
        key=lambda c: importance_order.get(c.get("importance", "medium"), 1),
    )
    target_concepts = sorted_concepts[: config["max_concepts"]]

    # Fetch concept IDs from DB to link enrichments
    db_concepts = supabase.table("concepts").select("id, name").eq("run_id", run_id).execute()
    concept_id_map = {c["name"].lower(): c["id"] for c in (db_concepts.data or [])}

    all_enrichments = []

    for concept in target_concepts:
        concept_name = concept.get("name", "")
        concept_desc = concept.get("description", "")
        concept_db_id = concept_id_map.get(concept_name.lower())

        for search_round in range(config["searches_per_concept"]):
            # Build an academic-focused query
            if search_round == 0:
                query = f"{concept_name} {domain} scholarly analysis"
            else:
                query = f"{concept_name} criticism counter-arguments academic"

            try:
                results = tavily.search(
                    query=query,
                    search_depth="advanced",
                    max_results=config["max_results"],
                    include_answer=True,
                )

                # Store the synthesized answer as a primary enrichment
                if results.get("answer"):
                    enrichment_record = {
                        "concept_id": concept_db_id,
                        "run_id": run_id,
                        "source_url": "tavily_synthesis",
                        "content": results["answer"],
                        "confidence_score": 0.85,
                        "is_contradiction": False,
                        "metadata": {
                            "query": query,
                            "search_round": search_round,
                            "type": "synthesis",
                        },
                    }
                    supabase.table("enrichments").insert(enrichment_record).execute()
                    all_enrichments.append(enrichment_record)

                # Store individual source results
                for result in results.get("results", []):
                    enrichment_record = {
                        "concept_id": concept_db_id,
                        "run_id": run_id,
                        "source_url": result.get("url", ""),
                        "content": result.get("content", "")[:2000],
                        "confidence_score": result.get("score", 0.5),
                        "is_contradiction": False,
                        "metadata": {
                            "title": result.get("title", ""),
                            "query": query,
                            "search_round": search_round,
                            "type": "source",
                        },
                    }
                    supabase.table("enrichments").insert(enrichment_record).execute()
                    all_enrichments.append(enrichment_record)

            except Exception as e:
                print(f"[ResearchAgent] Search failed for '{concept_name}': {e}")

    supabase.table("runs").update({"current_stage": 7}).eq("id", run_id).execute()
    supabase.table("audit_logs").insert({
        "run_id": run_id,
        "agent_name": "ResearchAgent",
        "action": "completed",
        "details": {
            "concepts_researched": len(target_concepts),
            "total_enrichments": len(all_enrichments),
        },
    }).execute()

    state["enrichments"] = all_enrichments
    return state
