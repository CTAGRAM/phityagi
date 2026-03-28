const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://ayjdrpfixcnetvicefev.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRycGZpeGNuZXR2aWNlZmV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM1NzY0OCwiZXhwIjoyMDg5OTMzNjQ4fQ.8seKVRZqZqhAJqM_EfJe14DHy56f6kAmc7HUPkijlCo'
);

async function run() {
  const { data: runs, error } = await sb.from('runs').select('id, target_philosophy').order('created_at', { ascending: false }).limit(1);
  if (!runs || runs.length === 0) return console.log('No runs found', error);
  const runObj = runs[0];
  
  const { data: essays } = await sb.from('essays').select('title, content, essay_number').eq('run_id', runObj.id).order('essay_number');
  console.log('Run:', runObj.target_philosophy);
  
  let totalWords = 0;
  for (let i = 0; i < essays.length; i++) {
    const e = essays[i];
    const words = (e.content || '').split(/\s+/).length;
    totalWords += words;
    console.log('Essay ' + e.essay_number + ':', e.title, '| Words:', words, '| Chars:', (e.content || '').length);
  }
  console.log('Total Words Generated for Run:', totalWords);
}
run();
