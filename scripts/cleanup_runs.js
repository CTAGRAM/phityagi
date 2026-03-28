const { createClient } = require('@supabase/supabase-js');
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ayjdrpfixcnetvicefev.supabase.co';
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRycGZpeGNuZXR2aWNlZmV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM1NzY0OCwiZXhwIjoyMDg5OTMzNjQ4fQ.8seKVRZqZqhAJqM_EfJe14DHy56f6kAmc7HUPkijlCo';
const sb = createClient(sbUrl, sbKey);

async function cleanup() {
  const { data: runs } = await sb.from('runs').select('id, status, target_philosophy').order('created_at', { ascending: false });
  let foundSuccessful = false;
  let deleted = 0;
  
  for (const r of runs) {
    if (r.status === 'completed' && !foundSuccessful) {
      console.log('Keeping latest successful run:', r.target_philosophy, r.id);
      foundSuccessful = true;
      continue;
    }
    
    console.log('Deleting run:', r.status, r.id);
    await sb.from('chunks').delete().eq('run_id', r.id);
    await sb.from('documents').delete().eq('run_id', r.id);
    await sb.from('essays').delete().eq('run_id', r.id);
    await sb.from('runs').delete().eq('id', r.id);
    deleted++;
  }
  console.log('Deleted ' + deleted + ' runs.');
}
cleanup();
