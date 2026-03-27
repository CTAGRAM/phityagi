const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const sb = createClient(
  'https://ayjdrpfixcnetvicefev.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRycGZpeGNuZXR2aWNlZmV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM1NzY0OCwiZXhwIjoyMDg5OTMzNjQ4fQ.8seKVRZqZqhAJqM_EfJe14DHy56f6kAmc7HUPkijlCo'
);

async function run() {
  console.log("Starting programmatic pipeline run...");
  
  // 1. Get User
  const { data: users, error: userErr } = await sb.auth.admin.listUsers();
  if (userErr) throw userErr;
  const user = users.users.find(u => u.email === 'yourboiadi@gmail.com');
  if (!user) throw new Error("User not found");
  
  const userId = user.id;

  // 2. Create Run
  const { data: runObj, error: runErr } = await sb.from('runs').insert({
    user_id: userId,
    target_philosophy: 'Vaisheshika Philosophy (Padarthadharmasangraha and Vaisheshikasutra)',
    tone_preset: 'scholarly',
    citation_style: 'inline',
    status: 'intake',
    current_stage: 1,
  }).select().single();
  
  if (runErr) throw runErr;
  const runId = runObj.id;
  console.log(`Created Run: ${runId}`);

  // 3. Upload PDFs
  const files = [
    '/Users/rudra/tyagi/philosophy-engine/पदार्थधर्मसङ्ग्रहः.pdf',
    '/Users/rudra/tyagi/philosophy-engine/वैशेषिकसूत्रम्.pdf'
  ];

  let docCounter = 1;
  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const safeStorageName = `doc${docCounter++}.pdf`;
    const storagePath = `${userId}/${runId}/${Date.now()}_${safeStorageName}`;
    const fileBytes = fs.readFileSync(filePath);
    
    console.log(`Uploading ${fileName}...`);
    const { error: uploadErr } = await sb.storage
      .from('corpus_documents')
      .upload(storagePath, fileBytes, { contentType: 'application/pdf' });
      
    if (uploadErr) throw uploadErr;

    const { error: docErr } = await sb.from('documents').insert({
      run_id: runId,
      filename: fileName,
      file_path: storagePath,
      file_type: 'pdf',
      file_size: fileBytes.length,
      status: 'pending'
    });
    
    if (docErr) throw docErr;
    console.log(`Linked ${fileName} to Run.`);
  }

  // 4. Trigger Edge Function
  console.log("Triggering process-run Edge Function...");
  const { data: triggerData, error: triggerErr } = await sb.functions.invoke('process-run', {
    body: { runId: runId }
  });
  
  if (triggerErr) throw triggerErr;
  console.log("Trigger result:", triggerData);

  // 5. Poll Status
  console.log("Waiting for pipeline to complete...");
  
  let attempts = 0;
  while (attempts < 60) {
    await new Promise(r => setTimeout(r, 10000)); // Poll every 10s
    attempts++;
    
    const { data: currentRun } = await sb.from('runs').select('*').eq('id', runId).single();
    if (!currentRun) break;
    
    console.log(`[Timer: ${attempts * 10}s] Stage: ${currentRun.current_stage}/16 | Status: ${currentRun.status} | Essays: ${currentRun.completed_essays || 0}/${currentRun.total_essays || '?'}`);
    
    if (currentRun.status === 'completed' || currentRun.status === 'failed') {
      console.log(`Pipeline finished with status: ${currentRun.status}`);
      if (currentRun.error_message) {
        console.error(`Error: ${currentRun.error_message}`);
      }
      break;
    }
  }
}

run().catch(console.error);
