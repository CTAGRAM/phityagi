export const TONE_PRESETS = [
  { id: 'scholarly', label: 'Neutral Scholarly', description: 'Precise, measured, academic register' },
  { id: 'expository', label: 'High-Clarity Expository', description: 'Clear, accessible, explanation-focused' },
  { id: 'analytical', label: 'Severe Analytical', description: 'Austere, rigorous, argument-dense' },
  { id: 'essayistic', label: 'Grand Essayistic', description: 'Literary, elevated, rhetorically rich' },
  { id: 'pedagogical', label: 'Pedagogical', description: 'Teaching-oriented, scaffolded, didactic' },
  { id: 'custom', label: 'Custom', description: 'Define your own tone via prompt' },
] as const;

export const SUPPORTED_FILE_TYPES = [
  'application/pdf',
  'application/epub+zip',
  'text/plain',
  'text/markdown',
  'text/html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const FILE_EXTENSIONS = ['.pdf', '.epub', '.txt', '.md', '.html', '.docx'] as const;

export const PIPELINE_STAGES = [
  { id: 1, name: 'Intake', icon: 'inbox' },
  { id: 2, name: 'Normalisation', icon: 'file-text' },
  { id: 3, name: 'OCR & Parsing', icon: 'scan' },
  { id: 4, name: 'Chunking & Indexing', icon: 'layers' },
  { id: 5, name: 'Corpus Classification', icon: 'tag' },
  { id: 6, name: 'Scope Resolution', icon: 'target' },
  { id: 7, name: 'Series Blueprint', icon: 'map' },
  { id: 8, name: 'Coverage Audit', icon: 'shield-check' },
  { id: 9, name: 'Evidence Extraction', icon: 'search' },
  { id: 10, name: 'Concept Graph', icon: 'git-branch' },
  { id: 11, name: 'Series Memory', icon: 'brain' },
  { id: 12, name: 'Drafting', icon: 'pen-tool' },
  { id: 13, name: 'Audit', icon: 'check-circle' },
  { id: 14, name: 'Revision', icon: 'edit-3' },
  { id: 15, name: 'Continuity Reconciliation', icon: 'link' },
  { id: 16, name: 'Final Packaging', icon: 'package' },
] as const;

export const RUN_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  PLANNING: 'planning',
  DRAFTING: 'drafting',
  AUDITING: 'auditing',
  REVISING: 'revising',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const CITATION_STYLES = [
  { id: 'inline', label: 'Inline Academic' },
  { id: 'footnote', label: 'Footnote-Style' },
  { id: 'endnote', label: 'Endnote-Style' },
] as const;

export const SOURCE_CLASSES = [
  'primary_source',
  'fragment_testimonium',
  'commentary',
  'modern_secondary',
  'tertiary_reference',
  'editorial_apparatus',
  'bibliography',
  'uncertain',
] as const;
