"""
GNOSIS Extraction Agent
Performs deep reading of the ingested text to extract:
- Core concepts & definitions
- Arguments & logical structures
- Named entities & proper nouns
- Key quotations
- Implicit assumptions
- Conceptual dependencies
Stores structured concepts in the DB.
"""

import os
import json
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

from lib.supabase_client import get_supabase

# Maximum chars to send to a single extraction call
MAX_CONTEXT = 80000


async def run_extraction(state: dict) -> dict:
    """
    Extraction Agent entry point.
    Expects state with: run_id, raw_text
    Produces: concepts list, executive_summary
    """
    run_id = state["run_id"]
    raw_text = state.get("raw_text", "")
    supabase = get_supabase()

    supabase.table("runs").update({"status": "extracting", "current_stage": 4}).eq("id", run_id).execute()
    supabase.table("audit_logs").insert({
        "run_id": run_id,
        "agent_name": "ExtractionAgent",
        "action": "started",
        "details": {"text_length": len(raw_text)},
    }).execute()

    # Fetch run metadata for context
    run_resp = supabase.table("runs").select("*").eq("id", run_id).single().execute()
    run_data = run_resp.data
    target = run_data.get("target_philosophy", "the subject")
    domain_tag = run_data.get("domain_tag") or "auto-detect"

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0,
        api_key=os.environ.get("GEMINI_API_KEY"),
    )

    # Truncate for the extraction prompt (Gemini 2.5 Flash handles long context well)
    corpus = raw_text[:MAX_CONTEXT]

    extraction_prompt = f"""You are GNOSIS, an expert knowledge extraction engine. Analyze the following corpus about "{target}" and extract a comprehensive structured knowledge map.

DOMAIN CONTEXT: {domain_tag}

EXTRACT THE FOLLOWING (be exhaustive — miss nothing):

1. **Core Concepts**: Every significant concept, theory, principle, doctrine, or idea. Include definitions.
2. **Arguments & Claims**: Every argument, thesis, claim, or position. Note premises and conclusions.
3. **Named Entities**: People, places, texts, schools of thought, historical events.
4. **Key Quotations**: Important direct quotes with approximate location context.
5. **Implicit Assumptions**: Unstated premises the text relies upon.
6. **Conceptual Dependencies**: Which concepts presuppose or build upon others.
7. **Contested Claims**: Any claims that are debatable, ambiguous, or internally contradicted.

Return a JSON object with this exact structure:
{{
  "concepts": [
    {{
      "name": "concept name",
      "description": "detailed description (2-4 sentences)",
      "category": "one of: concept|argument|entity|quotation|assumption|paradox|definition",
      "importance": "high|medium|low",
      "dependencies": ["names of concepts this depends on"],
      "is_contested": false
    }}
  ],
  "executive_summary": "A comprehensive 300-500 word summary of the entire corpus covering all major themes, arguments, and contributions.",
  "domain_detected": "the primary intellectual domain (e.g., philosophy, religion, science)"
}}

CRITICAL: Extract AT LEAST 15 concepts. Miss nothing significant. Every argument, every definition, every named entity of importance must appear.

CORPUS:
{corpus}"""

    response = llm.invoke([HumanMessage(content=extraction_prompt)])
    response_text = response.content

    # Parse JSON from response (handle markdown code blocks)
    cleaned = response_text
    if "```json" in cleaned:
        cleaned = cleaned.split("```json", 1)[1]
    if "```" in cleaned:
        cleaned = cleaned.split("```", 1)[0]
    cleaned = cleaned.strip()

    try:
        extracted = json.loads(cleaned)
    except json.JSONDecodeError:
        # Fallback: try to find JSON object in the response
        import re
        json_match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if json_match:
            extracted = json.loads(json_match.group())
        else:
            extracted = {
                "concepts": [{"name": target, "description": "Primary subject of analysis", "category": "concept", "importance": "high", "dependencies": [], "is_contested": False}],
                "executive_summary": f"Analysis of {target} from the provided corpus.",
                "domain_detected": domain_tag,
            }

    concepts = extracted.get("concepts", [])
    executive_summary = extracted.get("executive_summary", "")
    domain_detected = extracted.get("domain_detected", domain_tag)

    # Store concepts in DB
    for concept in concepts:
        supabase.table("concepts").insert({
            "run_id": run_id,
            "name": concept.get("name", "Unknown"),
            "description": concept.get("description", ""),
            "metadata": {
                "category": concept.get("category", "concept"),
                "importance": concept.get("importance", "medium"),
                "dependencies": concept.get("dependencies", []),
                "is_contested": concept.get("is_contested", False),
            },
        }).execute()

    # Update run with domain tag if auto-detected
    update_data = {"current_stage": 5}
    if domain_detected and domain_tag == "auto-detect":
        update_data["domain_tag"] = domain_detected
    supabase.table("runs").update(update_data).eq("id", run_id).execute()

    supabase.table("audit_logs").insert({
        "run_id": run_id,
        "agent_name": "ExtractionAgent",
        "action": "completed",
        "details": {
            "concepts_extracted": len(concepts),
            "domain_detected": domain_detected,
            "summary_length": len(executive_summary),
        },
    }).execute()

    state["concepts"] = concepts
    state["executive_summary"] = executive_summary
    state["domain_detected"] = domain_detected
    return state
