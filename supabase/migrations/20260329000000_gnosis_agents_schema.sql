-- GNOSIS Architecture Schema Update

-- 1. Concepts Table
CREATE TABLE IF NOT EXISTS public.concepts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid REFERENCES public.runs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enrichments Table (Tavily responses)
CREATE TABLE IF NOT EXISTS public.enrichments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  concept_id uuid REFERENCES public.concepts(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.runs(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  content text NOT NULL,
  confidence_score float,
  is_contradiction boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid REFERENCES public.runs(id) ON DELETE CASCADE,
  agent_name text NOT NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: We assume RLS policies will be simple (or anon key accessible for now) to match existing local functionality

ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow all policies for Phase 0 testing
CREATE POLICY "allow_all_concepts" ON public.concepts FOR ALL USING (true);
CREATE POLICY "allow_all_enrichments" ON public.enrichments FOR ALL USING (true);
CREATE POLICY "allow_all_audit_logs" ON public.audit_logs FOR ALL USING (true);

-- Adding a few extra columns to runs specifically for GNOSIS
ALTER TABLE public.runs 
ADD COLUMN IF NOT EXISTS enrichment_depth text DEFAULT 'Standard',
ADD COLUMN IF NOT EXISTS domain_tag text;
