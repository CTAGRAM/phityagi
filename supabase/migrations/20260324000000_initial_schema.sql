-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-----------------------------------------------------------
-- 1. Tables
-----------------------------------------------------------

-- RUNS TABLE
-- Represents a single execution/project for a philosophy series
create table if not exists public.runs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  target_philosophy text not null,
  
  -- Configuration
  tone_preset text not null default 'scholarly',
  custom_tone text,
  citation_style text not null default 'inline',
  corpus_only boolean not null default true,
  
  -- State Tracking
  status text not null default 'pending', -- pending, extracting, chunking, indexing, drafting, completed, failed
  current_stage integer not null default 1,
  total_essays integer,
  completed_essays integer default 0,
  
  error_message text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- DOCUMENTS TABLE
-- Represents raw files (PDFs, EPUBs, etc.) uploaded for a specific run
create table if not exists public.documents (
  id uuid default uuid_generate_v4() primary key,
  run_id uuid references public.runs(id) on delete cascade not null,
  
  filename text not null,
  file_path text not null, -- path in Supabase storage
  file_size bigint not null,
  file_type text not null,
  
  status text not null default 'pending', -- pending, extracted, error
  error_message text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- CHUNKS TABLE
-- Represents semantically distinct blocks of text extracted from documents
create table if not exists public.chunks (
  id uuid default uuid_generate_v4() primary key,
  document_id uuid references public.documents(id) on delete cascade not null,
  run_id uuid references public.runs(id) on delete cascade not null, -- denormalized for easier querying
  
  content text not null,
  -- We assume Gemini text-embedding-004 which has 768 dimensions
  embedding vector(768), 
  
  -- Metadata like page number, section heading, structural position
  metadata jsonb default '{}'::jsonb not null,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for vector similarity search
create index if not exists chunks_embedding_idx on public.chunks using hnsw (embedding vector_cosine_ops);

-- CLAIMS TABLE
-- Extracted philosophical propositions, arguments, or definitions from chunks
create table if not exists public.claims (
  id uuid default uuid_generate_v4() primary key,
  run_id uuid references public.runs(id) on delete cascade not null,
  
  content text not null,
  claim_type text not null default 'proposition', -- definition, proposition, normative, meta
  uncertainty_level text not null default 'low', -- low, medium, high
  certainty_justification text,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- CHUNK_CLAIMS TABLE (Join Table)
-- Maps which chunks support which claims (Many-to-Many)
create table if not exists public.chunk_claims (
  id uuid default uuid_generate_v4() primary key,
  chunk_id uuid references public.chunks(id) on delete cascade not null,
  claim_id uuid references public.claims(id) on delete cascade not null,
  
  is_primary_source boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(chunk_id, claim_id)
);

-- ESSAYS TABLE
-- Generated essays representing chapters in the series
create table if not exists public.essays (
  id uuid default uuid_generate_v4() primary key,
  run_id uuid references public.runs(id) on delete cascade not null,
  
  essay_number integer not null,
  title text not null,
  content text, -- Markdown content
  
  status text not null default 'pending', -- pending, drafting, reviewing, completed
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-----------------------------------------------------------
-- 2. Row Level Security (RLS)
-----------------------------------------------------------

-- Enable RLS on all tables
alter table public.runs enable row level security;
alter table public.documents enable row level security;
alter table public.chunks enable row level security;
alter table public.claims enable row level security;
alter table public.chunk_claims enable row level security;
alter table public.essays enable row level security;

-- Create policies for Runs
create policy "Users can view their own runs"
  on public.runs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own runs"
  on public.runs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own runs"
  on public.runs for update
  using (auth.uid() = user_id);

create policy "Users can delete their own runs"
  on public.runs for delete
  using (auth.uid() = user_id);

-- Create policies for Documents
create policy "Users can view docs of their runs"
  on public.documents for select
  using (run_id in (select id from public.runs where user_id = auth.uid()));

create policy "Users can insert docs to their runs"
  on public.documents for insert
  with check (run_id in (select id from public.runs where user_id = auth.uid()));

create policy "Users can update docs of their runs"
  on public.documents for update
  using (run_id in (select id from public.runs where user_id = auth.uid()));

create policy "Users can delete docs of their runs"
  on public.documents for delete
  using (run_id in (select id from public.runs where user_id = auth.uid()));

-- Create policies for Chunks
create policy "Users can view chunks of their runs"
  on public.chunks for select
  using (run_id in (select id from public.runs where user_id = auth.uid()));

create policy "Users can insert chunks to their runs"
  on public.chunks for insert
  with check (run_id in (select id from public.runs where user_id = auth.uid()));

create policy "Users can delete chunks of their runs"
  on public.chunks for delete
  using (run_id in (select id from public.runs where user_id = auth.uid()));

-- Create policies for Claims
create policy "Users can view claims of their runs"
  on public.claims for select
  using (run_id in (select id from public.runs where user_id = auth.uid()));

create policy "Users can insert claims to their runs"
  on public.claims for insert
  with check (run_id in (select id from public.runs where user_id = auth.uid()));

-- Create policies for Chunk Claims
create policy "Users can view chunk_claims of their runs"
  on public.chunk_claims for select
  using (claim_id in (select id from public.claims where run_id in (select id from public.runs where user_id = auth.uid())));

create policy "Users can insert chunk_claims to their runs"
  on public.chunk_claims for insert
  with check (claim_id in (select id from public.claims where run_id in (select id from public.runs where user_id = auth.uid())));

-- Create policies for Essays
create policy "Users can view essays of their runs"
  on public.essays for select
  using (run_id in (select id from public.runs where user_id = auth.uid()));

create policy "Users can insert essays to their runs"
  on public.essays for insert
  with check (run_id in (select id from public.runs where user_id = auth.uid()));

create policy "Users can update essays of their runs"
  on public.essays for update
  using (run_id in (select id from public.runs where user_id = auth.uid()));

-----------------------------------------------------------
-- 3. Storage Buckets
-----------------------------------------------------------
-- Since Supabase storage requires a bucket, we instruct how to create it via the API
insert into storage.buckets (id, name, public) 
values ('corpus_documents', 'corpus_documents', false)
on conflict (id) do nothing;

create policy "Users can view their own corpus documents"
  on storage.objects for select
  using ( bucket_id = 'corpus_documents' and auth.uid() = owner );

create policy "Users can upload their own corpus documents"
  on storage.objects for insert
  with check ( bucket_id = 'corpus_documents' and auth.uid() = owner );

create policy "Users can delete their own corpus documents"
  on storage.objects for delete
  using ( bucket_id = 'corpus_documents' and auth.uid() = owner );

-----------------------------------------------------------
-- 4. Triggers (Updated_at)
-----------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_runs_updated
  before update on public.runs
  for each row execute procedure public.handle_updated_at();

create trigger on_essays_updated
  before update on public.essays
  for each row execute procedure public.handle_updated_at();

-----------------------------------------------------------
-- 5. Realtime Publication
-----------------------------------------------------------
-- Enable Realtime for the runs and essays tables so the UI can listen to pipeline step updates
alter publication supabase_realtime add table public.runs;
alter publication supabase_realtime add table public.essays;
