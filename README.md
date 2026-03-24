# 🏛️ Philosophy Series Engine

An AI-powered system that ingests scholarly documents (PDFs, EPUB, DOCX) and automatically generates a complete, citation-backed philosophical essay series using Google's Gemini 2.0.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)
![Gemini](https://img.shields.io/badge/Gemini-2.0_Flash-4285F4?logo=google)

---

## ✨ Features

- **16-Stage AI Pipeline** — Intake → OCR → Chunking → Embedding → Blueprint → Drafting → Packaging
- **Real PDF Extraction** — Uses Gemini File API to extract text from scanned & digital PDFs
- **Gemini 2 Embeddings** — Semantic vector indexing via `gemini-embedding-2-preview` (768-dim, normalized)
- **Dynamic Series Planning** — AI plans 3–5 interdependent scholarly essays based on corpus scope
- **Citation-Backed Drafting** — Every claim traces to your uploaded corpus
- **Real-Time Progress** — Watch the pipeline advance through all 16 stages via WebSocket
- **Package Export** — Download the complete essay series as Markdown or JSON
- **Premium Dark UI** — Apple/Linear-inspired glassmorphism design

---

## 🚀 Quick Start

### Prerequisites

You need the following installed on your machine:

| Tool | Version | Download |
|------|---------|----------|
| **Node.js** | v18+ | [nodejs.org](https://nodejs.org/) |
| **npm** | v9+ | Comes with Node.js |
| **Git** | Any | [git-scm.com](https://git-scm.com/) |

### One-Command Setup

**Mac / Linux:**
```bash
git clone https://github.com/CTAGRAM/phityagi.git
cd phityagi
chmod +x setup.sh
./setup.sh
```

**Windows (PowerShell):**
```powershell
git clone https://github.com/CTAGRAM/phityagi.git
cd phityagi
.\setup.bat
```

The setup script will:
1. ✅ Check that Node.js is installed
2. ✅ Install all npm dependencies
3. ✅ Create your `.env.local` from the template
4. ✅ Prompt you for your Supabase keys
5. ✅ Start the dev server at `http://localhost:3000`

---

## 🔧 Manual Setup

If you prefer to set things up manually:

```bash
# 1. Clone the repo
git clone https://github.com/CTAGRAM/phityagi.git
cd phityagi

# 2. Install dependencies
npm install

# 3. Create env file
cp .env.local.example .env.local

# 4. Fill in your keys in .env.local (see below)

# 5. Start the dev server
npm run dev
```

### Environment Variables

Create a `.env.local` file in the project root with:

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# These are only needed if you're self-hosting the Supabase project
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

> **Note:** The Gemini API key is stored as a **Supabase Edge Function Secret** and is never needed in the frontend. If you're deploying your own Supabase project, set it via:
> ```bash
> npx supabase secrets set GEMINI_API_KEY=your_gemini_key --project-ref YOUR_PROJECT_REF
> ```

---

## 🗄️ Supabase Setup

If you're setting up your own Supabase project:

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the migration SQL in the SQL Editor:
   - Copy the contents of `supabase/migrations/20260324000000_initial_schema.sql`
   - Paste and run it in the Supabase SQL Editor
3. Enable Realtime for live progress updates:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE public.runs;
   ALTER PUBLICATION supabase_realtime ADD TABLE public.essays;
   ```
4. Deploy the Edge Function:
   ```bash
   npx supabase login
   npx supabase functions deploy process-run --project-ref YOUR_PROJECT_REF --no-verify-jwt
   ```
5. Set the Gemini API key as a secret:
   ```bash
   npx supabase secrets set GEMINI_API_KEY=your_key --project-ref YOUR_PROJECT_REF
   ```

---

## 📖 How to Use

1. Open `http://localhost:3000` in your browser
2. Sign up / log in (Supabase Auth)
3. Click **New Run** in the sidebar
4. Enter a philosophy topic (e.g., "Vaisheshika", "Stoicism", "Advaita Vedānta")
5. Upload your source PDFs / documents
6. Select tone preset and citation style
7. Click **Commence Generation**
8. Watch the 16-stage pipeline progress in real-time
9. Read the generated essays in the **Essays** tab
10. Download the complete package from the **Download** tab

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Backend | Supabase Edge Functions (Deno) |
| Database | Supabase PostgreSQL + pgvector |
| Storage | Supabase Storage (S3-compatible) |
| AI Generation | Gemini 2.0 Flash |
| AI Embeddings | gemini-embedding-2-preview (768-dim) |
| Auth | Supabase Auth |
| Realtime | Supabase Realtime (WebSocket) |

---

## 📁 Project Structure

```
phityagi/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Dashboard
│   │   ├── runs/
│   │   │   ├── new/page.tsx      # New Run (upload & configure)
│   │   │   ├── [id]/page.tsx     # Run Detail (pipeline + essays)
│   │   │   └── page.tsx          # Run History
│   │   ├── settings/page.tsx     # API Key Settings
│   │   ├── error.tsx             # Error Boundary
│   │   ├── layout.tsx            # Root Layout
│   │   └── globals.css           # Design System
│   ├── components/
│   │   └── layout/Sidebar.tsx    # Collapsible Sidebar
│   └── lib/
│       ├── constants.ts          # App Constants
│       └── supabase/
│           ├── client.ts         # Browser Supabase Client
│           └── server.ts         # Server Supabase Client
├── supabase/
│   ├── functions/
│   │   └── process-run/
│   │       └── index.ts          # 16-Stage Pipeline Edge Function
│   └── migrations/
│       └── 20260324000000_initial_schema.sql
├── setup.sh                      # Mac/Linux setup script
├── setup.bat                     # Windows setup script
└── .env.local.example            # Environment template
```

---

## 📄 License

MIT
