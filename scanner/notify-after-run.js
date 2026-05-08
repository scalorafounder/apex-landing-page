/**
 * Called by run-all.ps1 after all scanners finish.
 * Queries for leads updated in the last 2 hours and sends notifications.
 * Usage: node notify-after-run.js
 */
import 'dotenv/config';
import { supabase } from './lib/supabase.js';
import { notifyNewLeads } from './lib/notify.js';

const LOOKBACK_HOURS = 2;

async function main() {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, signal_types, last_signal_at, property:properties(site_address, city, zip)')
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('notify-after-run: query failed:', error.message);
    process.exit(0); // don't fail the run over a notification error
  }

  const rows = (leads ?? []).map(l => {
    const p = Array.isArray(l.property) ? l.property[0] : l.property;
    return {
      lead_id: l.id,
      address: p?.site_address ?? 'Unknown address',
      city: p?.city ?? '',
      zip: p?.zip ?? '',
      signal_type: l.signal_types?.[0] ?? 'unknown',
      filing_date: l.last_signal_at?.slice(0, 10) ?? '—',
    };
  });

  if (rows.length === 0) {
    console.log('notify-after-run: no new leads in the last 2h, skipping.');
    return;
  }

  console.log(`notify-after-run: ${rows.length} new/updated lead(s) — sending notifications…`);
  await notifyNewLeads(rows, 'APEX scanner batch');
  console.log('notify-after-run: done.');
}

main().catch(err => {
  console.error('notify-after-run error:', err.message);
  process.exit(0);
});
