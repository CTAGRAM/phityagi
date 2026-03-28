const { createClient } = require('@supabase/supabase-js');

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ayjdrpfixcnetvicefev.supabase.co';
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRycGZpeGNuZXR2aWNlZmV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM1NzY0OCwiZXhwIjoyMDg5OTMzNjQ4fQ.8seKVRZqZqhAJqM_EfJe14DHy56f6kAmc7HUPkijlCo';

const sb = createClient(sbUrl, sbKey);

let lastCount = -1;

async function check() {
  const { data: run } = await sb.from('runs').select('*').order('created_at', { ascending: false }).limit(1).single();
  if (run) {
    if (run.completed_essays !== lastCount) {
      console.log(`[Timer: ${new Date().toISOString()}] Essays completed: ${run.completed_essays} / ${run.total_essays}. Status: ${run.status}`);
      lastCount = run.completed_essays;
    }
    if (run.status === 'completed' || run.status === 'failed') {
      console.log("Pipeline finished!");
      process.exit(0);
    }
  }
}

setInterval(check, 10000);
check();
