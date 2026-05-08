// Boston Code Violations scanner.
// Source: Analyze Boston open data API (CKAN datastore).
// Resource: "Building and Property Violations" by Inspectional Services Department.
//
// Run:  node registries/boston_violations.js          (yesterday)
//       node registries/boston_violations.js --days=7
//       node registries/boston_violations.js --backfill   (everything ever, run once)

import 'dotenv/config';
import { fetch } from 'undici';
import { supabase, startScanRun, finishScanRun } from '../lib/supabase.js';
import { matchPropertyByAddress } from '../lib/address.js';

const SOURCE_KEY = 'boston_violations_api';
const SOURCE_URL = 'https://data.boston.gov/dataset/code-enforcement-building-and-property-violations';
const RESOURCE_ID = '800a2663-1d6a-46e7-9356-bedb70f5332c';

// Our 9 Boston ZIPs
const BOSTON_ZIPS = ['02108','02116','02118','02127','02128','02129','02130','02132','02210'];

// CLI args
const args = process.argv.slice(2);
const daysArg = args.find(a => a.startsWith('--days='));
const daysBack = daysArg ? parseInt(daysArg.split('=')[1], 10) : parseInt(process.env.SCAN_DAYS_BACK || '1', 10);
const backfill = args.includes('--backfill');

async function fetchPage(offset, limit, sinceDate) {
  // Use CKAN's SQL endpoint — supports IN, ORDER BY, date comparisons.
  // Filter dates at SQL level (records aren't necessarily ordered by status_dttm).
  // Records with null status_dttm are excluded when sinceDate is set; in backfill
  // we include everything.
  const dateFilter = sinceDate ? `AND status_dttm >= '${sinceDate}'` : '';
  const sql = `
    SELECT _id, case_no, status_dttm, status, code, value, description,
           violation_stno, violation_sthigh, violation_street, violation_suffix,
           violation_city, violation_zip, sam_id, latitude, longitude
    FROM "${RESOURCE_ID}"
    WHERE violation_zip IN (${BOSTON_ZIPS.map(z => `'${z}'`).join(',')})
    ${dateFilter}
    ORDER BY _id DESC
    LIMIT ${limit} OFFSET ${offset}
  `.trim().replace(/\s+/g, ' ');

  const url = `https://data.boston.gov/api/3/action/datastore_search_sql?sql=${encodeURIComponent(sql)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  const data = await res.json();
  if (!data.success) throw new Error(`API failure: ${JSON.stringify(data.error || data).slice(0, 200)}`);
  return data.result.records || [];
}

function buildAddress(r) {
  const parts = [r.violation_stno, r.violation_sthigh && r.violation_sthigh !== r.violation_stno ? `-${r.violation_sthigh}` : '', r.violation_street, r.violation_suffix]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return parts;
}

function parseDate(s) {
  if (!s) return null;
  // status_dttm is ISO format like "2026-05-04T15:23:11"
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch { return null; }
}

async function main() {
  console.log(`\n🔍 Scanning Boston code violations`);
  console.log(`   Source: ${SOURCE_URL}`);
  console.log(`   ZIPs:   ${BOSTON_ZIPS.join(', ')}`);
  console.log(`   Mode:   ${backfill ? 'BACKFILL (all records)' : `last ${daysBack} day(s)`}\n`);

  const scanRunId = await startScanRun(SOURCE_KEY);
  let processed = 0;
  let inserted = 0;
  let skippedDupes = 0;
  let skippedNoMatch = 0;

  // Server-side date filter (or null for backfill = all records)
  const sinceDate = backfill ? null : new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  console.log(`   sinceDate (server filter): ${sinceDate || 'none — full backfill'}\n`);

  try {
    const PAGE_SIZE = 500;
    let offset = 0;

    while (true) {
      const records = await fetchPage(offset, PAGE_SIZE, sinceDate);
      if (records.length === 0) break;

      for (const r of records) {
        processed++;

        // Dedup: case_no should be unique; document_id = case_no
        const docId = r.case_no;
        const { data: existing } = await supabase
          .from('signals')
          .select('id')
          .eq('source', SOURCE_KEY)
          .eq('document_id', docId)
          .maybeSingle();
        if (existing) { skippedDupes++; continue; }

        // Build address and match
        const street = buildAddress(r);
        if (!street) { skippedNoMatch++; continue; }
        const match = await matchPropertyByAddress({
          street,
          city: r.violation_city,
          zip: r.violation_zip,
        });
        if (!match.propertyId || match.confidence < 0.4) {
          skippedNoMatch++;
          continue;
        }

        // Insert signal
        const { error } = await supabase.from('signals').insert({
          property_id: match.propertyId,
          signal_type: 'code_violation',
          source: SOURCE_KEY,
          source_url: SOURCE_URL,
          document_id: docId,
          filing_date: parseDate(r.status_dttm),
          raw_text: `${r.description || ''} | code=${r.code} status=${r.status} | ${street}, ${r.violation_city} ${r.violation_zip}`,
          parsed_data: {
            case_no: r.case_no,
            code: r.code,
            description: r.description,
            status: r.status,
            value: r.value,
            street,
            city: r.violation_city,
            zip: r.violation_zip,
            lat: parseFloat(r.latitude),
            lng: parseFloat(r.longitude),
            sam_id: r.sam_id,
          },
          match_confidence: match.confidence,
        });
        if (error) {
          console.error(`   ⚠️ insert failed for case ${docId}: ${error.message}`);
          continue;
        }
        inserted++;
        if (inserted % 10 === 0) console.log(`   inserted ${inserted}...`);
      }

      console.log(`   page offset ${offset}: scanned ${records.length}, inserted ${inserted} (cumulative)`);
      offset += PAGE_SIZE;
      if (records.length < PAGE_SIZE) break; // last page
    }

    await finishScanRun(scanRunId, { documentsProcessed: processed, signalsCreated: inserted });

    console.log(`\n✅ Scan complete.`);
    console.log(`   Processed:          ${processed}`);
    console.log(`   Inserted:           ${inserted}`);
    console.log(`   Skipped (dupe):     ${skippedDupes}`);
    console.log(`   Skipped (no match): ${skippedNoMatch}`);

  } catch (err) {
    console.error('\n❌ Fatal:', err);
    await finishScanRun(scanRunId, { documentsProcessed: processed, signalsCreated: inserted, errorMessage: err.message });
    process.exit(1);
  }
}

main();
