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
  retries = 3
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

  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Add custom timeout controller set to 12 minutes for massive generations
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12 * 60 * 1000);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal
        },
      );
      
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status} ${await res.text()}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        console.error(`Gemini returned empty text (Attempt ${attempt}). Full response:`, JSON.stringify(data));
        throw new Error(`Gemini empty response: ${JSON.stringify(data)}`);
      }
      return text;
    } catch (error: any) {
      lastError = error;
      console.error(`Gemini call failed (Attempt ${attempt}/${retries}):`, error.message);
      if (attempt < retries) {
        console.log(`Retrying in 15 seconds...`);
        await delay(15000);
      }
    }
  }
  throw lastError;
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

    // Use much more of the corpus for planning — up to 30K chars for blueprint
    const blueprintCorpus = combinedText.slice(0, 30000);

    const scopeStatement = await callGemini(
      apiKey,
      `You are a scholarly philosophy analyst. Based on the following corpus content, write a detailed scope statement (5-8 sentences) defining what "${run.target_philosophy}" means as covered by these texts. Enumerate ALL the major topics, categories, entities, arguments, and philosophical positions mentioned. Be precise about temporal, doctrinal, and geographical scope. Do not leave out any topic area.\n\nFull corpus:\n${blueprintCorpus}`,
    );

    await updateStage(supabase, runId, 7, "indexing");

    // Blueprint: plan 5-7 chapters that are deeply granular so every topic is covered
    const blueprintRaw = await callGemini(
      apiKey,
      `You are a scholarly philosophy series planner with the goal of EXHAUSTIVE COVERAGE. You must ensure that EVERY SINGLE concept, category, argument, example, definition, verse, sutra, and philosophical position present in the corpus is assigned to at least one chapter.

Based on the corpus below about "${run.target_philosophy}", generate a comprehensive chapter plan.

CRITICAL RULES:
1. Generate between 5 and 7 chapters — enough to cover EVERY topic in the source material
2. Each chapter should focus on a coherent thematic unit
3. Together, all chapters must cover 100% of the source material — DO NOT leave anything uncovered
4. For each chapter, list the SPECIFIC topics, categories, terms, and concepts it must address
5. The chapters should form a logical progression: foundational → categorical → doctrinal → epistemological → metaphysical → debates → synthesis

Return a JSON object with:
{
  "series_title": "string — the title for the entire series",
  "essay_count": <number 5-7>,
  "essays": [
    {
      "number": 1,
      "title": "string — precise, descriptive chapter title",
      "scope": "Detailed 3-5 sentence description of EVERYTHING this chapter must cover. List specific concepts, categories, arguments, and Sanskrit/philosophical terms.",
      "key_topics": ["topic1", "topic2", "topic3"],
      "depends_on": []
    }
  ]
}

Source corpus (read every word carefully):\n${blueprintCorpus}`,
      undefined,
      true,
    );

    let blueprint: any = null;
    try {
      blueprint = JSON.parse(blueprintRaw);
    } catch {
      blueprint = {
        series_title: `${run.target_philosophy}: A Comprehensive Philosophical Study`,
        essay_count: 5,
        essays: [
          { number: 1, title: `Foundations and Historical Context of ${run.target_philosophy}`, scope: "Complete overview, historical origins, key thinkers, foundational texts, and the philosophical landscape.", key_topics: ["origins", "key_thinkers", "foundational_texts"], depends_on: [] },
          { number: 2, title: `Ontological Categories and Metaphysical Framework`, scope: "Every metaphysical category, substance, quality, action, and their detailed enumeration.", key_topics: ["categories", "substances", "qualities", "actions"], depends_on: [1] },
          { number: 3, title: `Epistemological Methods and Theory of Knowledge`, scope: "All means of valid knowledge, perception, inference, testimony, and logical methods.", key_topics: ["pramana", "perception", "inference", "testimony"], depends_on: [1, 2] },
          { number: 4, title: `Detailed Analysis of Core Doctrines`, scope: "Deep dive into each major doctrinal position, arguments, counter-arguments, and examples.", key_topics: ["core_doctrines", "arguments", "counter_arguments"], depends_on: [1, 2, 3] },
          { number: 5, title: `Synthesis, Legacy, and Complete Philosophical Significance`, scope: "How all concepts interconnect, historical reception, modern relevance, and a comprehensive summary.", key_topics: ["synthesis", "legacy", "modern_relevance"], depends_on: [1, 2, 3, 4] },
        ],
      };
    }

    const essayPlan = (blueprint.essays || []).slice(0, 7);
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

    // Pass the FULL corpus to each essay — Gemini 2.5 Flash supports up to ~1M tokens
    // We split the corpus into segments so each chapter gets relevant sections
    const fullCorpus = combinedText.slice(0, 100000); // up to 100K chars (~25K words)
    const corpusSegmentSize = Math.ceil(fullCorpus.length / essayCount);
    
    const draftedEssays: string[] = [];

    for (let i = 0; i < essayPlan.length; i++) {
      const essayDef = essayPlan[i];
      const prevSummary = draftedEssays.length > 0 ? draftedEssays[draftedEssays.length - 1].slice(0, 500) : "";

      const toneMap: Record<string, string> = {
        scholarly: "rigorous academic prose with precise philosophical terminology",
        analytical: "deeply analytical style with logical rigor and systematic argumentation",
        literary: "rich literary style combining philosophical depth with eloquent expression",
        pedagogical: "thorough pedagogical style with exhaustive explanations and illustrative examples",
        explanatory: "comprehensive explanatory style ensuring complete understanding of every concept",
        custom: run.custom_tone || "thorough scholarly style",
      };

      // Give each chapter the FULL corpus plus its focused segment for emphasis
      const focusedSegment = fullCorpus.slice(i * corpusSegmentSize, (i + 1) * corpusSegmentSize + 2000);
      
      const essayPrompt = `You are writing Chapter ${essayDef.number} of ${essayCount} titled "${essayDef.title}" for a definitive philosophical study on "${run.target_philosophy}".

## ABSOLUTE REQUIREMENTS — READ CAREFULLY:
1. **EXHAUSTIVE COVERAGE**: This chapter MUST capture EVERY SINGLE piece of information from the source material relevant to its scope. Do NOT summarize — ELABORATE on every concept, every term, every argument, every verse, every category, every definition.
2. **NO INFORMATION LEFT BEHIND**: Every concept, Sanskrit/philosophical term, enumeration, classification, argument, counter-argument, example, analogy, and doctrinal position within the scope MUST be included and explained in full detail.
3. **DEPTH OVER BREVITY**: Write at minimum 2000 words. There is no maximum. If the source material contains extensive content for this chapter's scope, write 3000-5000+ words.
4. **PRESERVE ORIGINAL STRUCTURE**: If the source material lists categories, enumerate ALL of them. If it defines terms, define ALL of them. If it presents arguments, present ALL of them with their premises and conclusions.
5. **SCHOLARLY PRECISION**: Use proper transliterations of all Sanskrit/philosophical terms. Include original terms in parentheses when translating.
6. **FORMAT**: Use proper Markdown with ## headings, ### sub-headings, bullet lists for enumerations, and > blockquotes for important definitions or original verses.

## Chapter Scope:
${essayDef.scope}
${essayDef.key_topics ? `\nKey topics to cover: ${essayDef.key_topics.join(', ')}` : ''}

## Style: ${toneMap[run.tone_preset] || "rigorous academic prose"}
## Citations: ${run.citation_style || "inline"}
${prevSummary ? `\n## Context from previous chapter:\n${prevSummary}` : "This is the opening chapter."}

## PRIMARY SOURCE MATERIAL (extract EVERY relevant detail):
${focusedSegment}

## FULL CORPUS CONTEXT (for cross-references and completeness):
${fullCorpus.slice(0, 50000)}

REMEMBER: The reader should be able to reconstruct the ENTIRE content of the original source material from your chapters alone. Leave NOTHING out. Every verse, every definition, every classification, every argument must appear.`;

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
