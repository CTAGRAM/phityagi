#!/usr/bin/env bash
set -e

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   🏛️  Philosophy Series Engine — Setup               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── 1. Check Node.js ─────────────────────────────────────
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo ""
    echo "   Please install Node.js v18+ from: https://nodejs.org/"
    echo "   Then re-run this script."
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js v18+ is required. You have $(node -v)."
    echo "   Download the latest from: https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js $(node -v) detected"

# ─── 2. Check npm ────────────────────────────────────────
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. It should come with Node.js."
    exit 1
fi
echo "✅ npm $(npm -v) detected"

# ─── 3. Install dependencies ────────────────────────────
echo ""
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"

# ─── 4. Setup environment variables ─────────────────────
if [ ! -f .env.local ]; then
    echo ""
    echo "🔑 Setting up environment variables..."
    echo ""
    
    read -p "Enter your Supabase Project URL (e.g., https://xxx.supabase.co): " SUPABASE_URL
    read -p "Enter your Supabase Anon Key: " SUPABASE_ANON_KEY
    read -p "Enter your Supabase Service Role Key (optional, press Enter to skip): " SUPABASE_SERVICE_KEY

    cat > .env.local << EOF
# Supabase
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_KEY}
EOF

    echo ""
    echo "✅ .env.local created"
else
    echo ""
    echo "✅ .env.local already exists (skipping)"
fi

# ─── 5. Start dev server ────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   🚀 Starting dev server...                          ║"
echo "║   Open http://localhost:3000 in your browser         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
npm run dev
