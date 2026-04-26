import { google } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for backend use (bypassing RLS if necessary, but here we can just use anon key or service role)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages, runId } = await req.json();

  // Fetch run metadata to give context to the assistant
  let contextStr = "You are GNOSIS, a highly advanced academic synthesizer and cross-domain AI agent.";
  if (runId) {
    const { data: run } = await supabase.from('runs').select('*').eq('id', runId).single();
    if (run) {
      contextStr += `\nYou are currently discussing the subject "${run.target_philosophy}".
Intellectual Domains: ${run.domain_tags ? run.domain_tags.join(', ') : run.domain_tag}.
Tone: ${run.tone_preset}.
Use the searchCorpus tool to find exact quotes and knowledge extracted from the user's uploaded documents for this specific run.`;
    }
  }

  const result = streamText({
    model: google('gemini-2.5-flash'),
    system: contextStr,
    messages,
    tools: {
      searchCorpus: tool({
        description: 'Search the semantic knowledge base (the corpus of uploaded documents) for relevant information. Use this whenever asked about specific concepts from the text.',
        parameters: z.object({
          query: z.string().describe('The semantic search query.'),
        }),
        execute: async ({ query }) => {
          if (!runId) return "No active book selected to search.";
          
          // Generate embedding for the query using Gemini embedding API
          const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: "models/text-embedding-004",
              content: { parts: [{ text: query }] }
            })
          });
          const embedData = await embedRes.json();
          const embedding = embedData.embedding?.values;
          if (!embedding) return "Failed to generate search embedding.";

          // Query Supabase vector store
          const { data, error } = await supabase.rpc('match_chunks', {
            query_embedding: embedding,
            match_threshold: 0.7,
            match_count: 5,
            filter_run_id: runId
          });

          if (error) return `Search error: ${error.message}`;
          if (!data || data.length === 0) return "No relevant information found in the corpus for this query.";

          return data.map((d: any) => `Source: ${d.metadata?.source || 'Unknown'}\nContent: ${d.content}`).join('\n\n');
        },
      }),
      webResearch: tool({
        description: 'Perform a live web search to gather external information, check facts, or enrich the context.',
        parameters: z.object({
          query: z.string().describe('The search query.'),
        }),
        execute: async ({ query }) => {
          const tavilyKey = process.env.TAVILY_API_KEY;
          if (!tavilyKey) return "Web research is currently disabled (missing API key).";

          const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: tavilyKey,
              query,
              search_depth: "advanced",
              include_answer: true,
              max_results: 3
            })
          });
          
          const data = await res.json();
          if (data.answer) {
             return `Answer: ${data.answer}\n\nSources:\n${data.results.map((r: any) => `- ${r.title}: ${r.content} (${r.url})`).join('\n')}`;
          }
          return data.results.map((r: any) => `- ${r.title}: ${r.content} (${r.url})`).join('\n');
        },
      })
    },
  });

  return result.toDataStreamResponse();
}
