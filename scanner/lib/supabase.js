// Shared Supabase client for the scanner. Uses service-role key (bypasses RLS).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Open a scan_run row at the start, close it at the end.
export async function startScanRun(source) {
  const { data, error } = await supabase
    .from('scan_runs')
    .insert({ source, started_at: new Date().toISOString(), status: 'running' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function finishScanRun(id, { documentsProcessed, signalsCreated, errorMessage }) {
  await supabase.from('scan_runs').update({
    completed_at: new Date().toISOString(),
    status: errorMessage ? 'failed' : 'success',
    documents_processed: documentsProcessed,
    signals_created: signalsCreated,
    error_message: errorMessage || null,
  }).eq('id', id);
}

// Resolve the date range for an incremental ("since-last") scan.
//
// Returns { dateFrom, dateTo } where dateFrom is:
//   - 2 days BEFORE the most recent successful filing_date for this source
//     (overlap window guarantees we don't miss a record while a registry is
//      still indexing yesterday's filings)
//   - if no prior signals exist for this source, falls back to today − fallbackDays
//
// Daily/3×-daily cron should pass `--since-last`; the scanner then computes
// its own date window and dedups against existing document_ids in `signals`.
export async function getIncrementalDateRange(source, fallbackDays = 7) {
  const today = new Date();
  const { data, error } = await supabase
    .from('signals')
    .select('filing_date, detected_at')
    .eq('source', source)
    .order('filing_date', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw error;

  let from;
  if (data?.length && (data[0].filing_date || data[0].detected_at)) {
    const latest = new Date(data[0].filing_date ?? data[0].detected_at);
    // 2-day overlap window for late-indexing safety
    latest.setUTCDate(latest.getUTCDate() - 2);
    from = latest;
  } else {
    from = new Date(today.getTime() - fallbackDays * 24 * 60 * 60 * 1000);
  }
  return { dateFrom: from, dateTo: today };
}
