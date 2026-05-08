/**
 * Send new-lead notifications after a scan run.
 * Reads enabled recipients from notification_settings in Supabase,
 * sends via Resend (email) and Twilio (SMS) directly — no Next.js dependency.
 */

import { supabase } from './supabase.js';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://real-deal-wholesale-ai.vercel.app';

/**
 * Notify all enabled recipients about newly inserted leads.
 * @param {Array<{address, city, zip, signal_type, filing_date, lead_id}>} leads
 * @param {string} scannerLabel  e.g. "Suffolk Registry"
 */
export async function notifyNewLeads(leads, scannerLabel) {
  if (!leads || leads.length === 0) return;

  const { data: settings } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('enabled', true);

  const recipients = settings ?? [];
  if (recipients.length === 0) return;

  const subject = `APEX: ${leads.length} new lead${leads.length !== 1 ? 's' : ''} — ${scannerLabel}`;
  const bodyText = leads.map(l =>
    `• ${l.address}, ${l.city} ${l.zip}\n  ${l.signal_type.replace(/_/g, ' ')} · filed ${l.filing_date}\n  ${APP_URL}/leads/${l.lead_id}`
  ).join('\n\n');

  const results = await Promise.allSettled(
    recipients.map(r =>
      r.type === 'email'
        ? sendEmail(r.destination, subject, bodyText)
        : sendSms(r.destination, `${subject}\n\n${bodyText}`)
    )
  );

  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) {
    for (const f of failed) console.warn('  ⚠️  Notification failed:', f.reason?.message);
  }
  const sent = results.length - failed.length;
  if (sent > 0) console.log(`  📬 Notifications sent: ${sent}/${results.length} recipients`);
}

async function sendEmail(to, subject, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not configured');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: [to],
      subject,
      text,
    }),
  });
  if (!res.ok) throw new Error(`Resend: ${await res.text()}`);
}

async function sendSms(to, message) {
  const sid  = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !auth || !from) throw new Error('Twilio env vars not configured');

  const body = new URLSearchParams({ To: to, From: from, Body: message.slice(0, 1600) });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Twilio: ${await res.text()}`);
}
