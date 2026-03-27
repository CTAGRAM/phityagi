import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Vercel function configuration
export const maxDuration = 300; // 5 minutes max on Vercel Pro, locally unlimited

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function updateStage(supabase: any, runId: string, stage: number, status: string) {
  await supabase.from("runs").update({ current_stage: stage, status }).eq("id", runId);
}

async function callGemini(
  apiKey: string,
  prompt: string,
  inlineData?: { mimeType: string; data: string },
  jsonMode?: boolean,
): Promise<string> {
  const parts: any[] = [];
  if (inlineData) {
    parts.push({ inlineData });
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
      model: "models/gemini-embedding-001",
      content: { parts: [{ text }] },
      output_dimensionality: 768,
      task_type: "RETRIEVAL_DOCUMENT"
    }));

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${apiKey}`, {
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

async function runPipeline(supabase: any, runId: string, apiKey: string) {
  try {
    await updateStage(supabase, runId, 1, "extracting");
    await delay(1000);

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

    await updateStage(supabase, runId, 2, "extracting");
    await delay(800);

    await updateStage(supabase, runId, 3, "extracting");

    const extractPromises = docs.map(async (doc: any) => {
      try {
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

        let fileBase64 = '';
        const isClientSideFile = typeof Buffer !== 'undefined';
        if (isClientSideFile) {
           fileBase64 = Buffer.from(fileBytes).toString('base64');
        } else {
           const chunk = 8192;
           let base64String = "";
           for (let i = 0; i < fileBytes.length; i += chunk) {
             base64String += String.fromCharCode.apply(null, Array.from(fileBytes.subarray(i, i + chunk)));
           }
           fileBase64 = btoa(base64String);
        }

        const extractedText = await callGemini(
          apiKey,
          `You are a scholarly text extraction assistant. Extract ALL text content from this document verbatim, preserving paragraph structure, headings, footnotes, and section markers. Do not summarize or skip any content. Output plain text only.`,
          { mimeType, data: fileBase64 },
        );

        await supabase.from("documents").update({ status: "extracted" }).eq("id", doc.id);
        
        return { docId: doc.id, text: extractedText };
      } catch (docErr: any) {
        console.error(`Error processing doc ${doc.filename}:`, docErr.message);
        await supabase
          .from("documents")
          .update({ status: "error", error_message: docErr.message })
          .eq("id", doc.id);
        throw docErr;
      }
    });

    const results = await Promise.allSettled(extractPromises);
    const allExtractedTexts = results
      .filter((r): r is PromiseFulfilledResult<{ docId: string; text: string }> => r.status === "fulfilled")
      .map((r: any) => r.value);

    if (allExtractedTexts.length === 0) {
      throw new Error("No documents could be extracted. All files failed OCR/parsing.");
    }

    const combinedText = allExtractedTexts.map((d) => d.text).join("\n\n---DOCUMENT BREAK---\n\n");

    await updateStage(supabase, runId, 4, "extracting");

    for (const { docId, text } of allExtractedTexts) {
      const chunks = chunkText(text, 1200, 150);
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
         // Insert in batches of 100 to avoid PostgREST limits
         for (let i = 0; i < chunkInserts.length; i += 100) {
            const { error: chunkErr } = await supabase.from("chunks").insert(chunkInserts.slice(i, i + 100));
            if (chunkErr) console.error("Chunk insert error:", chunkErr.message);
         }
      }
    }

    await updateStage(supabase, runId, 5, "indexing");
    await updateStage(supabase, runId, 6, "indexing");
    const scopeStatement = await callGemini(
      apiKey,
      `You are a scholarly philosophy analyst. Based on the following corpus content, write a concise scope statement (3-5 sentences) defining what "${run.target_philosophy}" means as covered by these texts. Be precise about temporal, doctrinal, and geographical scope.\n\nCorpus excerpt (first 2000 chars):\n${combinedText.slice(0, 2000)}`,
    );

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
  ]
}

The essays should form a coherent progression: foundational first, then doctrinal, then debates, then synthesis.

Corpus excerpt:\n${combinedText.slice(0, 3000)}`,
      undefined,
      true,
    );

    let blueprint: any = null;
    try {
      blueprint = JSON.parse(blueprintRaw);
    } catch {
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

    const essayPlan = (blueprint.essays || []).slice(0, 3);
    const essayCount = essayPlan.length;

    await updateStage(supabase, runId, 8, "indexing");
    await updateStage(supabase, runId, 9, "indexing");
    await updateStage(supabase, runId, 10, "indexing");
    await updateStage(supabase, runId, 11, "indexing");
    
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

    await updateStage(supabase, runId, 13, "drafting");
    await updateStage(supabase, runId, 14, "drafting");
    await updateStage(supabase, runId, 15, "drafting");
    
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

export async function POST(req: Request) {
  try {
    const { runId } = await req.json();

    if (!runId) {
      return NextResponse.json({ error: "Missing runId" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured on server" }, { status: 500 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Need service role to bypass RLS
    
    if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ error: "Supabase generic configuration missing" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Run pipeline in the background so request can complete
    runPipeline(supabase, runId, apiKey).catch(console.error);

    return NextResponse.json({ success: true, message: "Pipeline started in Next.js backend" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
