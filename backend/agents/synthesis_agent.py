"""
GNOSIS Synthesis Agent
Merges extracted concepts and enriched web data into a cohesive, structured JSON schema
suitable for PDF generation and conversational grounding.
Resolves and highlights contradictions.
"""

import os
import json
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

from lib.supabase_client import get_supabase

async def run_synthesis(state: dict) -> dict:
    """
    Synthesis Agent entry point.
    Expects state with: run_id, concepts, enrichments, executive_summary, domain_detected
    Produces: synthesis_document (structured JSON)
    """
    run_id = state["run_id"]
    concepts = state.get("concepts", [])
    enrichments = state.get("enrichments", [])
    exec_summary = state.get("executive_summary", "")
    domain = state.get("domain_detected", "")
    
    supabase = get_supabase()
    
    supabase.table("runs").update({"status": "synthesizing", "current_stage": 8}).eq("id", run_id).execute()
    supabase.table("audit_logs").insert({
        "run_id": run_id,
        "agent_name": "SynthesisAgent",
        "action": "started",
        "details": {"concepts": len(concepts), "enrichments": len(enrichments)},
    }).execute()

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0.1,
        api_key=os.environ.get("GEMINI_API_KEY"),
    )

    # Build an input payload representing the raw extracted and enriched data
    synthesis_input = {
        "domain": domain,
        "executive_summary_draft": exec_summary,
        "concepts": concepts,
        "enrichments": enrichments,
    }
    
    # We must ensure the input fits inside the context window.
    # 2.5-flash has a 1M context window, so we are safe dumping JSON.
    input_str = json.dumps(synthesis_input, indent=2)

    prompt = f"""You are the GNOSIS Synthesis Agent. Your task is to merge raw extracted text concepts and live web research into a final, highly structured, publication-ready Knowledge JSON Document.

INPUT DATA:
{input_str}

REQUIREMENTS:
1. Merge the data into a single coherent structure.
2. Weave the 'enrichments' (Tavily web search results) directly into their corresponding 'concepts'. 
3. Explicitly surface contradictions between the original text and web research if any exist.
4. Generate a 'Cross-Domain Synthesis' section that connects these concepts to other intellectual fields.
5. Provide a refined 'Executive Summary'.
6. Produce a 'Bibliography' containing URLs and derived citations from the enrichments.

RETURN EXACTLY A JSON OBJECT matching this schema:
{{
  "title": "A synthesized title",
  "domain": "{domain}",
  "executive_summary": "Refined comprehensive summary.",
  "cross_domain_synthesis": "Thematic bridges to other disciplines (e.g. how a philosophical point relates to physics or economics).",
  "sections": [
    {{
      "title": "Logical section title (e.g., Core Concepts, Key Arguments, Entities)",
      "items": [
        {{
          "name": "Item name",
          "description": "Expanded description synthesizing original text and web research.",
          "is_contested": false,
          "enrichment_notes": ["Any supplementary insights from the web findings"],
          "citations": [1, 2] // indices referencing the bibliography
        }}
      ]
    }}
  ],
  "bibliography": [
    {{
      "id": 1,
      "source_url": "https://...",
      "title": "Document Title",
      "type": "web"
    }}
  ]
}}

Make sure the output is VALID JSON without any markdown formatting wrappers (no ```json ... ```).
"""

    response = llm.invoke([HumanMessage(content=prompt)])
    response_text = response.content.strip()
    
    if response_text.startswith("```json"):
        response_text = response_text.replace("```json", "", 1).strip()
    if response_text.endswith("```"):
        response_text = response_text[:-3].strip()

    try:
        final_doc = json.loads(response_text)
    except Exception as e:
        print(f"[SynthesisAgent] JSON Parse Error: {e}")
        print("Raw Output:", response_text)
        # Fallback dummy structure so pipeline doesn't crash completely
        final_doc = {
            "title": "Synthesized Knowledge Document",
            "domain": domain,
            "executive_summary": exec_summary,
            "cross_domain_synthesis": "Unable to synthesize.",
            "sections": [{"title": "Extracted Concepts", "items": [{"name": c.get("name"), "description": c.get("description"), "is_contested": False, "enrichment_notes": [], "citations": []} for c in concepts]}],
            "bibliography": []
        }

    # Optional: Save synthesized doc to a 'synthesis' table or just pass through state
    # Here we just pass it along to the Document Agent
    
    supabase.table("runs").update({"current_stage": 9}).eq("id", run_id).execute()
    supabase.table("audit_logs").insert({
        "run_id": run_id,
        "agent_name": "SynthesisAgent",
        "action": "completed",
        "details": {"sections_generated": len(final_doc.get("sections", []))},
    }).execute()

    state["synthesis_document"] = final_doc
    return state
