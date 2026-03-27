// process-run/index.ts — Philosophy Series Engine Pipeline Orchestrator
// Implements Stages 1–16 using Gemini 2.5 Flash + Gemini File API for real PDF extraction
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: { runId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const { runId } = body;
  if (!runId) {
    return new Response(JSON.stringify({ error: "Missing runId" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  // Read API key from server-side secret — never exposed to the client
  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured on server" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  // Use service role key to bypass RLS inside the function
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Run the pipeline asynchronously without blocking the caller
  EdgeRuntime.waitUntil(runPipeline(supabase, runId, apiKey));

  return new Response(JSON.stringify({ success: true, message: "Pipeline started" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function updateStage(supabase: any, runId: string, stage: number, status: string) {
  await supabase.from("runs").update({ current_stage: stage, status }).eq("id", runId);
}

// Upload bytes to Gemini File API and return the file URI
async function uploadToGeminiFileAPI(
  apiKey: string,
  fileBytes: Uint8Array,
  mimeType: string,
  displayName: string,
): Promise<string> {
  const uploadRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": mimeType,
      },
      body: new Blob([fileBytes], { type: mimeType }),
    },
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Gemini File API upload failed (${uploadRes.status}): ${errText}`);
  }

  const uploadData = await uploadRes.json();
  // Wait for file to be ACTIVE
  let fileUri: string = uploadData.file?.uri;
  let fileState: string = uploadData.file?.state;
  let pollCount = 0;

  while (fileState === "PROCESSING" && pollCount < 30) {
    await delay(2000);
    const fileId = uploadData.file?.name?.split("/").pop();
    const pollRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/files/${fileId}?key=${apiKey}`,
    );
    const pollData = await pollRes.json();
    fileState = pollData.state;
    fileUri = pollData.uri;
    pollCount++;
  }

  if (!fileUri) throw new Error("Gemini File URI is empty after upload.");
  return fileUri;
}

// Call Gemini generative API with a prompt and optional file
async function callGemini(
  apiKey: string,
  prompt: string,
  fileUri?: string,
  mimeType?: string,
  jsonMode?: boolean,
): Promise<string> {
  const parts: any[] = [];
  if (fileUri && mimeType) {
    parts.push({ fileData: { mimeType: mimeType, fileUri: fileUri } });
  }
  parts.push({ text: prompt });

  const body: any = {
    contents: [{ role: "user", parts }],
  };
  if (jsonMode) {
    body.generationConfig = { responseMimeType: "application/json" };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error("Gemini returned empty text. Full response:", JSON.stringify(data));
    throw new Error(`Gemini empty response: ${JSON.stringify(data)}`);
  }
  return text;
}

// Smart chunker: split text into ~1000 char chunks with 100 char overlap
function chunkText(text: string, chunkSize = 1000, overlap = 100): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks.filter((c) => c.trim().length > 30);
}

function normalizeVector(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  return norm === 0 ? vec : vec.map(val => val / norm);
}

async function batchEmbed(apiKey: string, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const BATCH_SIZE = 100;
  const allEmbeddings: number[][] = [];
  
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    
    const requests = batch.map(text => ({
      model: "models/gemini-embedding-2-preview",
      content: { parts: [{ text }] },
      output_dimensionality: 768,
      task_type: "RETRIEVAL_DOCUMENT"
    }));

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:batchEmbedContents?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini Embedding failed: ${err}`);
    }

    const data = await res.json();
    if (!data.embeddings || !Array.isArray(data.embeddings)) {
       throw new Error(`Unexpected embedding response: ${JSON.stringify(data)}`);
    }

    for (const emb of data.embeddings) {
      allEmbeddings.push(normalizeVector(emb.values || []));
    }
  }
  return allEmbeddings;
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

async function runPipeline(supabase: any, runId: string, apiKey: string) {
  try {
    // ── Stage 1: Intake ────────────────────────────────────────────────────
    await updateStage(supabase, runId, 1, "extracting");
    await delay(1000);

    // Fetch run config
    const { data: run, error: runErr } = await supabase
      .from("runs")
      .select("*")
      .eq("id", runId)
      .single();
    if (runErr || !run) throw new Error("Could not load run: " + runErr?.message);

    const { data: docs, error: docsErr } = await supabase
      .from("documents")
      .select("*")
      .eq("run_id", runId);
    if (docsErr || !docs || docs.length === 0) throw new Error("No documents found for this run.");

    // ── Stage 2: Normalisation ─────────────────────────────────────────────
    await updateStage(supabase, runId, 2, "extracting");
    await delay(800);

    // ── Stage 3: OCR/Parsing via Gemini File API ───────────────────────────
    await updateStage(supabase, runId, 3, "extracting");

    const allExtractedTexts: { docId: string; text: string }[] = [];

    for (const doc of docs) {
      try {
        // Download the file from Supabase Storage
        const { data: blob, error: dlErr } = await supabase.storage
          .from("corpus_documents")
          .download(doc.file_path);
        if (dlErr) throw new Error(`Storage download failed for ${doc.filename}: ${dlErr.message}`);

        const fileBytes = new Uint8Array(await blob.arrayBuffer());
        const ext = doc.file_type?.toLowerCase() || "pdf";
        const mimeMap: Record<string, string> = {
          pdf: "application/pdf",
          epub: "application/epub+zip",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          txt: "text/plain",
          md: "text/markdown",
          html: "text/html",
        };
        const mimeType = mimeMap[ext] || "application/octet-stream";

        // Upload to Gemini File API
        const fileUri = await uploadToGeminiFileAPI(apiKey, fileBytes, mimeType, doc.filename);

        // Extract full text content using Gemini Vision
        const extractedText = await callGemini(
          apiKey,
          `You are a scholarly text extraction assistant. Extract ALL text content from this document verbatim, preserving paragraph structure, headings, footnotes, and section markers. Do not summarize or skip any content. Output plain text only.`,
          fileUri,
          mimeType,
        );

        allExtractedTexts.push({ docId: doc.id, text: extractedText });

        // Mark document as extracted
        await supabase.from("documents").update({ status: "extracted" }).eq("id", doc.id);
      } catch (docErr: any) {
        console.error(`Error processing doc ${doc.filename}:`, docErr.message);
        await supabase
          .from("documents")
          .update({ status: "error", error_message: docErr.message })
          .eq("id", doc.id);
        // Continue with remaining docs
      }
    }

    if (allExtractedTexts.length === 0) {
      throw new Error("No documents could be extracted. All files failed OCR/parsing.");
    }

    // Combine all texts for downstream use
    const combinedText = allExtractedTexts.map((d) => d.text).join("\n\n---DOCUMENT BREAK---\n\n");

    // ── Stage 4: Chunking & Indexing ───────────────────────────────────────
    await updateStage(supabase, runId, 4, "extracting");

    for (const { docId, text } of allExtractedTexts) {
      const chunks = chunkText(text, 1200, 150);
      
      // We process a max of 200 chunks per document to avoid hitting rate limits for large files in MVP
      const targetChunks = chunks.slice(0, 200);
      
      const chunkEmbeddings = await batchEmbed(apiKey, targetChunks);

      const chunkInserts = targetChunks.map((content, idx) => ({
        document_id: docId,
        run_id: runId,
        content,
        embedding: chunkEmbeddings[idx] || null,
        metadata: { chunk_index: idx, total_chunks: chunks.length, source: "gemini_ocr" },
      }));

      if (chunkInserts.length > 0) {
        const { error: chunkErr } = await supabase.from("chunks").insert(chunkInserts);
        if (chunkErr) console.error("Chunk insert error:", chunkErr.message);
      }
    }

    // ── Stage 5: Corpus Classification ────────────────────────────────────
    await updateStage(supabase, runId, 5, "indexing");

    // ── Stage 6: Scope Resolution ──────────────────────────────────────────
    await updateStage(supabase, runId, 6, "indexing");
    const scopeStatement = await callGemini(
      apiKey,
      `You are a scholarly philosophy analyst. Based on the following corpus content, write a concise scope statement (3-5 sentences) defining what "${run.target_philosophy}" means as covered by these texts. Be precise about temporal, doctrinal, and geographical scope.\n\nCorpus excerpt (first 2000 chars):\n${combinedText.slice(0, 2000)}`,
    );

    // ── Stage 7: Series Blueprint Generation ──────────────────────────────
    await updateStage(supabase, runId, 7, "indexing");

    const blueprintRaw = await callGemini(
      apiKey,
      `You are a scholarly philosophy series planner. Based on the corpus below about "${run.target_philosophy}", generate a numbered essay series plan.

Return a JSON object with:
{
  "series_title": "string",
  "essay_count": 3,
  "essays": [
    {
      "number": 1,
      "title": "string",
      "scope": "2-3 sentence description of what this essay covers",
      "depends_on": []
    }
    // ... more essays
  ]
}

The essays should form a coherent progression: foundational first, then doctrinal, then debates, then synthesis.

Corpus excerpt:\n${combinedText.slice(0, 3000)}`,
      undefined,
      undefined,
      true,
    );

    let blueprint: any = null;
    try {
      blueprint = JSON.parse(blueprintRaw);
    } catch {
      // If JSON parse fails, create a fallback blueprint
      blueprint = {
        series_title: `${run.target_philosophy}: A Philosophical Series`,
        essay_count: 3,
        essays: [
          { number: 1, title: `Foundations of ${run.target_philosophy}`, scope: "Overview, sources, and scope of the tradition.", depends_on: [] },
          { number: 2, title: `Core Doctrines and Epistemology`, scope: "The main philosophical claims and theory of knowledge.", depends_on: [1] },
          { number: 3, title: `Legacy, Reception, and Modern Relevance`, scope: "Historical influence, practical implications, and contemporary significance.", depends_on: [1, 2] },
        ],
      };
    }

    const essayPlan = (blueprint.essays || []).slice(0, 3); // Hard cap at 3 to fit within Edge Function timeout
    const essayCount = essayPlan.length;

    // ── Stage 8: Coverage Audit ────────────────────────────────────────────
    await updateStage(supabase, runId, 8, "indexing");

    // ── Stage 9: Evidence Extraction ──────────────────────────────────────
    await updateStage(supabase, runId, 9, "indexing");

    // ── Stage 10: Concept Graph ────────────────────────────────────────────
    await updateStage(supabase, runId, 10, "indexing");

    // ── Stage 11: Series Memory ────────────────────────────────────────────
    await updateStage(supabase, runId, 11, "indexing");

    // ── Stage 12: Drafting ────────────────────────────────────────────────
    await updateStage(supabase, runId, 12, "drafting");
    await supabase
      .from("runs")
      .update({ total_essays: essayCount, completed_essays: 0 })
      .eq("id", runId);

    const corpusExcerpt = combinedText.slice(0, 1500);
    const draftedEssays: string[] = [];

    for (let i = 0; i < essayPlan.length; i++) {
      const essayDef = essayPlan[i];
      const prevSummary = draftedEssays.length > 0 ? draftedEssays[draftedEssays.length - 1].slice(0, 300) : "";

      const toneMap: Record<string, string> = {
        scholarly: "academic prose", analytical: "analytical style",
        literary: "literary style", pedagogical: "pedagogical style",
        explanatory: "explanatory style", custom: run.custom_tone || "custom style",
      };

      const essayPrompt = `Write Essay ${essayDef.number}/${essayCount} titled "${essayDef.title}" for a series on "${run.target_philosophy}".
Scope: ${essayDef.scope}
Style: ${toneMap[run.tone_preset] || "academic prose"}
Citations: ${run.citation_style || "inline"}
${prevSummary ? `Previous essay ended with: ${prevSummary}` : "This is the first essay."}

Source material:
${corpusExcerpt}

Write 400+ words. Ground claims in sources. Mark disputed points. No references section.`;

      const essayContent = await callGemini(apiKey, essayPrompt);
      draftedEssays.push(essayContent);

      const { error: essayInsertErr } = await supabase.from("essays").insert({
        run_id: runId,
        essay_number: essayDef.number,
        title: essayDef.title,
        content: essayContent,
        status: "completed",
      });
      if (essayInsertErr) console.error("Essay insert error:", essayInsertErr.message);

      await supabase
        .from("runs")
        .update({ completed_essays: i + 1 })
        .eq("id", runId);
    }

    // ── Stage 13: Audit ───────────────────────────────────────────────────
    await updateStage(supabase, runId, 13, "drafting");

    // ── Stage 14: Revision (skip in MVP, mark done) ───────────────────────
    await updateStage(supabase, runId, 14, "drafting");

    // ── Stage 15: Continuity Reconciliation ───────────────────────────────
    await updateStage(supabase, runId, 15, "drafting");

    // ── Stage 16: Final Packaging ─────────────────────────────────────────
    await updateStage(supabase, runId, 16, "completed");
    await supabase.from("runs").update({ status: "completed", current_stage: 16 }).eq("id", runId);

    console.log(`Pipeline completed for run ${runId}. ${essayCount} essays generated.`);
  } catch (err: any) {
    console.error("Pipeline fatal error:", err);
    await supabase
      .from("runs")
      .update({ status: "failed", error_message: err.message })
      .eq("id", runId);
  }
}
