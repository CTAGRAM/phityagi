// chat-rag/index.ts — RAG-based Chatbot using Gemini + pgvector semantic search
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

  let body: { question?: string; userId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const { question, userId } = body;
  if (!question) {
    return new Response(JSON.stringify({ error: "Missing question" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    // 1. Embed the question using Gemini embedding API
    const embRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,

      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: question }] },
          outputDimensionality: 768,
        }),
      },
    );
    const embData = await embRes.json();
    const queryEmbedding = embData?.embedding?.values;

    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error("Failed to embed question: " + JSON.stringify(embData));
    }

    // L2 normalize
    const norm = Math.sqrt(queryEmbedding.reduce((s: number, v: number) => s + v * v, 0));
    const normalized = queryEmbedding.map((v: number) => v / (norm || 1));

    // 2. Semantic search via pgvector cosine similarity
    // We search across ALL chunks for this user's runs
    const { data: chunks, error: searchErr } = await supabase.rpc("match_chunks", {
      query_embedding: normalized,
      match_threshold: 0.3,
      match_count: 8,
      p_user_id: userId || null,
    });

    if (searchErr) {
      console.error("Search error:", searchErr.message);
    }

    // Fetch run names to differentiate sources
    const runIds = Array.from(new Set(chunks?.map((c: any) => c.run_id).filter(Boolean)));
    const { data: runs } = await supabase.from('runs').select('id, target_philosophy').in('id', runIds);
    const runMap = new Map(runs?.map((r: any) => [r.id, r.target_philosophy]));

    const context = (chunks || [])
      .map((c: any, i: number) => `[Source ${i + 1} from book "${runMap.get(c.run_id) || 'Unknown Book'}"]: ${c.content}`)
      .join("\n\n");

    // 3. Fetch generated essays metadata to know what has been written
    let essayContext = "";
    if (userId) {
      const { data: essays } = await supabase
        .from("essays")
        .select("title, essay_number, runs!inner(target_philosophy)")
        .order("created_at", { ascending: false })
        .limit(30);
      if (essays && essays.length > 0) {
        essayContext = "Here is the table of contents for all philosophical books generated so far:\n" + essays
          .map((e: any) => `- Book: "${e.runs?.target_philosophy}" | Chapter ${e.essay_number}: ${e.title}`)
          .join("\n");
      }
    }

    // 4. Generate answer using Gemini with retrieved context
    const prompt = `You are a scholarly philosophy assistant with deep expertise. Answer the user's question using ONLY the source material and essay context provided below. If the sources don't contain enough information, say so honestly.
When citing information, ALWAYS mention the book/run name it came from to differentiate between multiple philosophical texts the user has analyzed.

Use rich markdown formatting:
- Use **bold** for key terms
- Use *italics* for Sanskrit/foreign terms
- Use LaTeX for any mathematical or logical notation: $inline$ or $$block$$
- Use > blockquotes for direct quotations from sources
- Use numbered lists for structured arguments
- Cite sources as [Source N from "Book Name"] when referencing specific chunks

SOURCE MATERIAL:
${context || "(No matching sources found in the corpus.)"}

${essayContext ? `PREVIOUSLY GENERATED ESSAYS:\n${essayContext}` : ""}

USER QUESTION: ${question}

Provide a thorough, well-cited answer:`;

    const genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      },
    );

    const genData = await genRes.json();
    const answer = genData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!answer) {
      throw new Error("Gemini returned empty answer: " + JSON.stringify(genData));
    }

    // 5. Return answer with source metadata
    const sources = (chunks || []).map((c: any) => ({
      content: c.content?.slice(0, 200),
      similarity: c.similarity,
      document_id: c.document_id,
      book_name: runMap.get(c.run_id) || 'Unknown Book',
    }));

    return new Response(
      JSON.stringify({ answer, sources, sourceCount: sources.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("Chat RAG error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
