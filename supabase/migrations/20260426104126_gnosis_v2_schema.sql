-- GNOSIS V2 Schema Upgrades

-- 1. Add new columns to runs table
ALTER TABLE public.runs 
ADD COLUMN IF NOT EXISTS domain_tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS ai_domain_select boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS custom_structure_prompt text,
ADD COLUMN IF NOT EXISTS is_biography boolean DEFAULT false;

-- 2. Migrate existing data (Convert single domain_tag to domain_tags array)
UPDATE public.runs 
SET domain_tags = ARRAY[domain_tag]
WHERE domain_tag IS NOT NULL AND domain_tags = '{}';

-- Note: We are keeping the old `domain_tag` column for backward compatibility temporarily,
-- but the frontend and backend will now rely on `domain_tags`.
