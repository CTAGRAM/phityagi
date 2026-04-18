"""
GNOSIS Document Agent
Takes the structured JSON output from the Synthesis Agent,
renders it to an HTML template using Jinja2,
and compiles it into a professional PDF using WeasyPrint.
Uploads the artifact directly to Supabase Storage.
"""

import os
import uuid
import datetime
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

from lib.supabase_client import get_supabase


def get_template_env():
    # Points to /backend/templates
    template_dir = os.path.join(os.path.dirname(__file__), '..', 'templates')
    return Environment(loader=FileSystemLoader(template_dir))

async def run_document_generation(state: dict) -> dict:
    """
    Document Agent entry point.
    Expects state with: run_id, synthesis_document
    Produces: pdf_link
    """
    run_id = state["run_id"]
    synthesis_doc = state.get("synthesis_document", {})
    supabase = get_supabase()

    supabase.table("runs").update({"status": "generating_pdf", "current_stage": 10}).eq("id", run_id).execute()
    supabase.table("audit_logs").insert({
        "run_id": run_id,
        "agent_name": "DocumentAgent",
        "action": "started",
        "details": {},
    }).execute()

    # Get the run details to find the correct folder path for the user
    run_resp = supabase.table("runs").select("user_id, target_philosophy").eq("id", run_id).single().execute()
    run_data = run_resp.data
    user_id = run_data.get("user_id", "default_user")

    # Render HTML from Jinja2
    env = get_template_env()
    template = env.get_template("pdf_template.html")
    
    # Context data for the template
    context = {
        "title": synthesis_doc.get("title", "Generated Knowledge Document"),
        "domain": synthesis_doc.get("domain", "General"),
        "date": datetime.datetime.now().strftime("%Y-%m-%d"),
        "executive_summary": synthesis_doc.get("executive_summary", ""),
        "cross_domain_synthesis": synthesis_doc.get("cross_domain_synthesis", ""),
        "sections": synthesis_doc.get("sections", []),
        "bibliography": synthesis_doc.get("bibliography", []),
    }
    html_out = template.render(context)

    # Convert HTML to PDF via WeasyPrint
    pdf_bytes = HTML(string=html_out).write_pdf()
    
    # Upload to Supabase Storage
    # The frontend expects PDF outputs to be in the outputs bucket OR public folder.
    # Currently runs use 'corpus_documents', but let's put the report in an 'outputs' conceptual path or 'runs'
    safe_target = run_data.get("target_philosophy", "gnosis_report").replace(" ", "_").replace("/", "_")
    file_path = f"{user_id}/{run_id}/{safe_target}_report.pdf"

    # Attempt to upload.
    # We will upload to 'corpus_documents' bucket to reuse existing RLS, but as an output file.
    # Alternatively we can use a new bucket if one exists. Let's use corpus_documents since we know it exists.
    try:
        supabase.storage.from_("corpus_documents").upload(
            path=file_path,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf"}
        )
    except Exception as e:
        print(f"[DocumentAgent] Upload failed, perhaps file exists? {e}")
        # Overwrite if exists
        try:
             supabase.storage.from_("corpus_documents").update(
                path=file_path,
                file=pdf_bytes,
                file_options={"content-type": "application/pdf"}
             )
        except Exception as update_err:
             print(f"[DocumentAgent] Update failed as well: {update_err}")
             raise

    # Obtain Public URL or just pass the path
    result_url = supabase.storage.from_("corpus_documents").get_public_url(file_path)

    # Mark run complete
    supabase.table("runs").update({
        "status": "completed",
        "current_stage": 16,
        "completed_essays": 1,
        "total_essays": 1
    }).eq("id", run_id).execute()

    supabase.table("audit_logs").insert({
        "run_id": run_id,
        "agent_name": "DocumentAgent",
        "action": "completed",
        "details": {"pdf_path": file_path, "bytes": len(pdf_bytes)},
    }).execute()

    state["pdf_path"] = file_path
    return state
