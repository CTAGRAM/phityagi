# GNOSIS — Multi-Agent Knowledge Synthesis Engine

> A multi-domain knowledge engine powered by LangGraph, Gemini, and Supabase. Upload any document across 12 intellectual domains and GNOSIS will extract concepts, enrich them with live web research, synthesize cross-domain connections, and generate publication-ready PDFs — all orchestrated by autonomous AI agents.

---

## Architecture

```
┌─────────────────────────────────┐     ┌──────────────────────────────────────┐
│   FRONTEND (Next.js :3000)      │     │   BACKEND (FastAPI :8000)            │
│                                 │     │                                      │
│   • Dashboard Overview          │     │   /api/v1/ingest (POST)              │
│   • New Run (12 Domain Selector)│────▶│     └── LangGraph Orchestrator       │
│   • Library (Domain Shelves)    │     │          ├─ IngestionAgent            │
│   • GNOSIS Chat (RAG + Drill)   │     │          ├─ ExtractionAgent          │
│   • Settings                    │     │          ├─ ResearchAgent (Tavily)    │
│                                 │     │          ├─ SynthesisAgent            │
│                                 │     │          └─ DocumentAgent (PDF)       │
└──────────┬──────────────────────┘     └───────────────┬──────────────────────┘
           │                                            │
           └────────── Supabase (pgvector) ◀────────────┘
                    • Authentication
                    • Storage (corpus_documents)
                    • Vector DB (chunks + embeddings)
                    • Edge Functions (chat-rag)
```

---

## 12 Intellectual Domains

Philosophy • Religion • Literature • History • Science • Law • Economics • Art • Language • Psychology • Politics • Technology

Each domain acts as a separate "bookshelf" in the Library. Documents uploaded under one domain are visually isolated, but the Chat engine semantically searches across ALL domains — enabling cross-disciplinary insight discovery.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | v18+ | Next.js frontend |
| **Python** | 3.11+ | FastAPI backend |
| **pip** | latest | Python package manager |
| **Git** | any | Version control |

### API Keys Required

| Key | Where to Get | Required? |
|-----|-------------|-----------|
| **Supabase URL + Anon Key** | [Supabase Dashboard → Settings → API](https://supabase.com/dashboard/project/_/settings/api) | ✅ Yes |
| **Supabase Service Role Key** | Same dashboard as above | ✅ Yes |
| **Gemini API Key** | [Google AI Studio](https://aistudio.google.com/apikey) | ✅ Yes |
| **Tavily API Key** | [Tavily](https://tavily.com) | ⚡ Optional (for web enrichment) |

---

## Setup Instructions

### Step 1: Clone the Repository

```bash
git clone https://github.com/CTAGRAM/phityagi.git
cd phityagi
```

### Step 2: Configure Environment Variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your API keys:

```env
# Supabase (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# LLM Provider (REQUIRED)
GEMINI_API_KEY=your_gemini_api_key_here

# Web Research (Optional - enables Drill Deeper and Research Agent)
TAVILY_API_KEY=your_tavily_key_here
```

### Step 3: Install & Run the Frontend

```bash
npm install
npm run dev
```

The frontend will start at **http://localhost:3000**.

### Step 4: Install & Run the Python Backend

Open a **second terminal**:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The backend will start at **http://localhost:8000**.

> **Windows Users**: Replace `source venv/bin/activate` with `venv\Scripts\activate`

### Step 5: Verify

1. Open **http://localhost:3000** — you should see the GNOSIS dashboard
2. Open **http://localhost:8000** — you should see `{"message":"GNOSIS Multi-Agent Backend is live."}`
3. Navigate to **New Run**, select a domain, upload a document, and hit "Initialize"

---

## Supabase Database Setup

If you're setting up your own Supabase project (not using the shared one), you need to create the following tables. Run these SQL commands in the Supabase SQL Editor:

### Core Tables (should already exist)

```sql
-- runs, documents, chunks tables (created by the initial project setup)
-- Make sure the 'chunks' table has a vector(768) 'embedding' column
-- Make sure 'runs' has: enrichment_depth text, domain_tag text
```

### GNOSIS Agent Tables

```sql
CREATE TABLE IF NOT EXISTS public.concepts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid REFERENCES public.runs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.enrichments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  concept_id uuid REFERENCES public.concepts(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.runs(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  content text NOT NULL,
  confidence_score float,
  is_contradiction boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid REFERENCES public.runs(id) ON DELETE CASCADE,
  agent_name text NOT NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Add GNOSIS columns to runs
ALTER TABLE public.runs
ADD COLUMN IF NOT EXISTS enrichment_depth text DEFAULT 'Standard',
ADD COLUMN IF NOT EXISTS domain_tag text;

-- Enable RLS
ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_concepts" ON public.concepts FOR ALL USING (true);
CREATE POLICY "allow_all_enrichments" ON public.enrichments FOR ALL USING (true);
CREATE POLICY "allow_all_audit_logs" ON public.audit_logs FOR ALL USING (true);
```

### Vector Search Function

```sql
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 8,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, content text, document_id uuid, run_id uuid, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.content, c.document_id, c.run_id,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM chunks c
  INNER JOIN runs r ON r.id = c.run_id
  WHERE (p_user_id IS NULL OR r.user_id = p_user_id)
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

---

## How It Works

### Pipeline Stages (triggered by "New Run")

| Stage | Agent | What It Does |
|-------|-------|-------------|
| 1-2 | **IngestionAgent** | Downloads document from Supabase Storage, extracts text via Gemini multimodal, chunks with overlap, embeds (768-dim), stores in `chunks` table |
| 3-5 | **ExtractionAgent** | Deep reads the full text — extracts concepts, arguments, entities, quotations, assumptions, dependencies as structured JSON into `concepts` table |
| 6-7 | **ResearchAgent** | Takes top concepts, runs Tavily academic web searches, stores source-stamped enrichments with contradiction flags in `enrichments` table |
| 8-9 | **SynthesisAgent** | Merges extraction + web research into a unified knowledge schema with cross-domain synthesis and bibliography |
| 10-16 | **DocumentAgent** | Renders the synthesis schema into a Jinja2 HTML template, compiles to PDF via WeasyPrint, uploads to Supabase Storage |

### Chat Features

- **RAG Search**: Semantic vector search across all your uploaded documents using `match_chunks`
- **Drill Deeper**: Click the "Drill Deeper" button to trigger a live Tavily web search on any topic mid-conversation
- **Cross-Domain**: Chat searches across ALL domains simultaneously — ask about psychology and get philosophy connections

---

## Project Structure

```
philosophy-engine/
├── backend/                    # Python FastAPI + LangGraph
│   ├── agents/
│   │   ├── orchestrator.py     # LangGraph state machine
│   │   ├── ingestion_agent.py  # Text extraction + chunking + embedding
│   │   ├── extraction_agent.py # Concept/argument extraction via Gemini
│   │   ├── research_agent.py   # Tavily web enrichment
│   │   ├── synthesis_agent.py  # Knowledge merging
│   │   └── document_agent.py   # PDF generation (Jinja2 + WeasyPrint)
│   ├── lib/
│   │   ├── supabase_client.py  # Server-side Supabase client
│   │   └── embeddings.py       # Gemini batch embedding utility
│   ├── templates/
│   │   └── pdf_template.html   # Academic PDF layout
│   ├── main.py                 # FastAPI entry point
│   └── requirements.txt        # Python dependencies
├── src/                        # Next.js frontend
│   ├── app/
│   │   ├── page.tsx            # Dashboard Overview
│   │   ├── runs/
│   │   │   ├── new/page.tsx    # New Run form (12 domain selector)
│   │   │   └── page.tsx        # GNOSIS Library (domain shelves + book covers)
│   │   ├── chat/page.tsx       # GNOSIS Chat (RAG + Drill Deeper)
│   │   └── settings/page.tsx   # Settings
│   └── components/
│       └── layout/Sidebar.tsx  # Navigation sidebar
├── supabase/
│   └── migrations/             # Database schema migrations
├── .env.example                # Template for environment variables
└── prompt.md                   # This file
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `@supabase/ssr: Your project's URL and API key are required` | Copy `.env.example` to `.env.local` and fill in keys |
| Backend won't start | Make sure you activated the venv: `source venv/bin/activate` |
| `ModuleNotFoundError` | Run `pip install -r requirements.txt` inside the venv |
| Supabase project paused | Go to [Supabase Dashboard](https://supabase.com/dashboard) and restore the project |
| Chat returns empty results | Upload and process at least one document first via New Run |
| WeasyPrint fails on Windows | Install GTK3: see [WeasyPrint docs](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html) |

---

## Quick Start (TL;DR)

```bash
git clone https://github.com/CTAGRAM/phityagi.git
cd phityagi
cp .env.example .env.local
# Edit .env.local with your API keys
npm install && npm run dev

# In a second terminal:
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload
```

Open **http://localhost:3000** and start synthesizing knowledge.
