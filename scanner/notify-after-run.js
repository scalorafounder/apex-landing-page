/**
 * Called by run-all.ps1 after all scanners finish.
 * Queries leads updated in the last 2 hours, compiles them into one email,
 * and sends it to every enabled recipient.
 */
import 'dotenv/config';
import { supabase } from './lib/supabase.js';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://apex-landing-page-4abm.vercel.app').replace(/\/$/, '');
const LOOKBACK_HOURS = 2;

async function main() {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, signal_types, last_signal_at, property:properties(site_address, city, zip, assessed_total)')
    .gte('updated_at', since)
    .order('last_signal_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('notify-after-run: query failed:', error.message);
    return;
  }

  const rows = (leads ?? []).map(l => {
    const p = Array.isArray(l.property) ? l.property[0] : l.property;
    return {
      lead_id: l.id,
      address: p?.site_address ?? 'Unknown address',
      city: p?.city ?? '',
      zip: p?.zip ?? '',
      assessed_total: p?.assessed_total ?? null,
      signal_type: (l.signal_types?.[0] ?? 'unknown').replace(/_/g, ' '),
      signal_count: l.signal_types?.length ?? 1,
      filing_date: l.last_signal_at?.slice(0, 10) ?? '—',
    };
  });

  if (rows.length === 0) {
    console.log('notify-after-run: no new leads — skipping notification.');
    return;
  }

  const { data: settings } = await supabase
    .from('notification_settings')
    .select('destination')
    .eq('type', 'email')
    .eq('enabled', true);

  const recipients = (settings ?? []).map(r => r.destination);
  if (recipients.length === 0) {
    console.log('notify-after-run: no email recipients configured.');
    return;
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('notify-after-run: RESEND_API_KEY not set — skipping.');
    return;
  }

  const subject = `APEX: ${rows.length} new lead${rows.length !== 1 ? 's' : ''} found`;

  const leadLines = rows.map((l, i) => {
    const value = l.assessed_total ? ` · assessed $${l.assessed_total.toLocaleString()}` : '';
    const signals = l.signal_count > 1 ? ` (${l.signal_count} signals)` : '';
    return [
      `${i + 1}. ${l.address}, ${l.city} ${l.zip}`,
      `   Signal: ${l.signal_type}${signals}  ·  Filed: ${l.filing_date}${value}`,
      `   ${APP_URL}/leads/${l.lead_id}`,
    ].join('\n');
  }).join('\n\n');

  const text = [
    `${rows.length} new distressed propert${rows.length !== 1 ? 'ies' : 'y'} found in the latest APEX scanner run.\n`,
    leadLines,
    `\n—\nView all leads: ${APP_URL}/inbox`,
  ].join('\n');

  const results = await Promise.allSettled(
    recipients.map(to =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'onboarding@resend.dev', to: [to], subject, text }),
      }).then(async r => {
        if (!r.ok) throw new Error(await r.text());
      })
    )
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) failed.forEach(f => console.warn('  ⚠️  Email failed:', f.reason?.message));
  console.log(`notify-after-run: sent to ${sent}/${recipients.length} recipients.`);
}

main().catch(err => {
  console.error('notify-after-run error:', err.message);
});
