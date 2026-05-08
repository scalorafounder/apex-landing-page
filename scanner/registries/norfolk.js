// Norfolk County Registry of Deeds scanner.
// Source: norfolkresearch.org/ALIS — Entry Date search.
// Covers 8 of our 50 ZIPs:
//   Brookline (02445, 02446), Milton (02186), Dover (02030), Westwood (02090),
//   Wellesley (02481, 02482), Needham (02492), Cohasset (02025)
//
// The ALIS search URL is constructed via GET params — no form interaction needed.
// Result page contains structured text records with Town + Address inline.
//
// Run:  node registries/norfolk.js              (yesterday)
//       node registries/norfolk.js --debug
//       node registries/norfolk.js --days=7

import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { supabase, startScanRun, finishScanRun, getIncrementalDateRange } from '../lib/supabase.js';
import { matchPropertyByAddress } from '../lib/address.js';

const SOURCE_KEY = 'norfolk_registry';
const SOURCE_URL = 'https://www.norfolkresearch.org/ALIS/WW400R.HTM';

const args = process.argv.slice(2);
const debug = args.includes('--debug');
const sinceLast = args.includes('--since-last');
const daysArg = args.find(a => a.startsWith('--days='));
const daysBack = daysArg ? parseInt(daysArg.split('=')[1], 10) : parseInt(process.env.SCAN_DAYS_BACK || '1', 10);

const DEBUG_DIR = path.resolve('./debug-norfolk');

// Norfolk County towns we care about (uppercase to match ALIS output)
const TARGET_TOWNS = new Set([
  'BROOKLINE', 'MILTON', 'DOVER', 'WESTWOOD',
  'WELLESLEY', 'NEEDHAM', 'COHASSET',
]);

// Map ALIS doc Type values → our signal_type
const DOC_TYPE_TO_SIGNAL = (() => {
  const m = new Map();
  // Lis Pendens / foreclosure
  m.set('LIS PENDENS',                'lis_pendens');
  m.set('NOTICE TO FORECLOSE MORTGAGE', 'lis_pendens');
  m.set('ORDER OF NOTICE',            'lis_pendens');
  // Tax taking variants
  m.set('TAX LIEN',                   'tax_taking');
  m.set('TAX TAKING',                 'tax_taking');
  m.set('TAKING',                     'tax_taking');
  m.set('MASSACHUSETTS TAX LIEN',     'tax_taking');
  m.set('MASS.OR U.S.TAX LIEN',       'tax_taking');
  m.set('NOTICE OF MASS LIEN',        'tax_taking');
  m.set('US TAX LIEN',                'tax_taking');
  // Mechanic's lien candidates
  m.set('LIEN',                       'mechanics_lien');
  m.set('NOTICE',                     'mechanics_lien');
  return m;
})();

// ── Date helpers ──────────────────────────────────────────────────────────

const fmtMMDDYYYY = d => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}${dd}${d.getFullYear()}`;  // ALIS uses MMDDYYYY without slashes
};

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(DEBUG_DIR, { recursive: true });

  let today, dateFrom;
  if (sinceLast) {
    const range = await getIncrementalDateRange(SOURCE_KEY, 7);
    today = range.dateTo;
    dateFrom = range.dateFrom;
  } else {
    today = new Date();
    dateFrom = new Date(today.getTime() - (daysBack - 1) * 24 * 60 * 60 * 1000);
  }

  console.log(`\n🔍 Scanning ${SOURCE_KEY}`);
  console.log(`   URL:        ${SOURCE_URL}`);
  console.log(`   Date range: ${fmtMMDDYYYY(dateFrom)} → ${fmtMMDDYYYY(today)}`);
  console.log(`   Towns:      ${[...TARGET_TOWNS].join(', ')}`);
  console.log(`   Doc types:  ${[...DOC_TYPE_TO_SIGNAL.keys()].join(', ')}`);
  console.log(`   Mode:       ${debug ? 'DEBUG' : 'production'}\n`);

  const scanRunId = await startScanRun(SOURCE_KEY);
  let documentsProcessed = 0;
  let signalsCreated = 0;

  const allRecords = [];
  // Re-launch browser per town to avoid Chrome page-crashes from memory accumulation
  // on long backfills (observed crash on town #7 during 365-day run).
  let browser = null;
  let ctx = null;
  let page = null;
  async function launchFreshBrowser() {
    if (browser) await browser.close().catch(() => {});
    browser = await chromium.launch({ channel: 'chrome', headless: !debug });
    ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    });
    page = await ctx.newPage();
  }
  await launchFreshBrowser();

  try {
    // ONE search per town with no doc type filter — easier than fighting the dropdown.
    // Filter relevant doc types client-side after we have all records.
    for (const town of TARGET_TOWNS) {
      const townLabel = town.charAt(0) + town.slice(1).toLowerCase();
      console.log(`\n🏛️  ${town}`);

      // Recycle the browser between towns to keep memory bounded
      await launchFreshBrowser();

      await page.goto(`${SOURCE_URL}?WSIQTP=LR09D&WSKYCD=E`, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(1200);

      await page.fill('input[name="W9FDTA"]', fmtMMDDYYYY(dateFrom));
      await page.fill('input[name="W9TDTA"]', fmtMMDDYYYY(today));
      try {
        await page.selectOption('select[name="W9TOWN"]', { label: townLabel });
      } catch (e) {
        console.log(`   ⚠️ town "${townLabel}" not selectable: ${e.message}`);
        continue;
      }
      await page.waitForTimeout(400);

      const searchBtn = await page.$('input[value="Search Records"]');
      if (!searchBtn) continue;
      await searchBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(2500);

      let pageNum = 1;
      const townRecords = [];
      let lastBookPage = null;
      while (true) {
        await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(700);
        let text;
        try { text = await page.evaluate(() => document.body?.innerText || ''); }
        catch (e) { await page.waitForTimeout(1500); try { text = await page.evaluate(() => document.body?.innerText || ''); } catch { text = ''; } }

        const records = parseRecords(text);
        // ALIS hides Town field when filtering by town — tag each record with the
        // town we searched for so downstream filtering knows what town it's in.
        for (const r of records) {
          if (!r.town) r.town = town;
        }
        // Detect end-of-results: same first record as last page = pagination dead
        if (records.length > 0 && records[0].bookPage === lastBookPage) break;
        if (records.length > 0) lastBookPage = records[0].bookPage;
        townRecords.push(...records);

        let advanced = false;
        try {
          const nextLink = page.locator('a').filter({ hasText: /^Next$/ }).first();
          if (await nextLink.count() > 0 && await nextLink.isVisible().catch(() => false)) {
            await nextLink.click({ timeout: 5_000 });
            await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
            await page.waitForTimeout(1000);
            advanced = true;
          }
        } catch (e) {}
        if (!advanced) break;
        pageNum++;
        // Cap at 60 pages = 180 records per town. For 1-day scans this is way
        // more than needed; for long backfills it captures more before hitting
        // ALIS's natural pagination limits.
        if (pageNum > 60) break;
      }
      console.log(`   ${pageNum} pages, ${townRecords.length} records`);
      allRecords.push(...townRecords);
    }

    documentsProcessed = allRecords.length;
    console.log(`\n📊 Total records: ${allRecords.length}`);

    // Step 4: Filter to target towns + relevant doc types
    const interesting = allRecords.filter(r => {
      const town = (r.town || '').toUpperCase().trim();
      if (!TARGET_TOWNS.has(town)) return false;
      const type = (r.docType || '').toUpperCase().trim();
      return DOC_TYPE_TO_SIGNAL.has(type);
    });
    console.log(`📋 Interesting (target town + relevant type): ${interesting.length}`);

    if (debug) {
      await writeFile(path.join(DEBUG_DIR, 'interesting.json'), JSON.stringify(interesting, null, 2));
    }

    // Step 5: Match each to property and insert signal
    console.log(`\n🔬 Matching and inserting signals...`);
    for (const rec of interesting) {
      try {
        const inserted = await processRecord(rec);
        if (inserted) {
          signalsCreated++;
          console.log(`   ✓ ${rec.docType} ${rec.bookPage} ${rec.town} ${rec.address}`);
        }
      } catch (err) {
        console.error(`   ❌ ${rec.bookPage}: ${err.message}`);
      }
    }

    await finishScanRun(scanRunId, { documentsProcessed, signalsCreated });
    console.log(`\n✅ Scan complete.`);
    console.log(`   Records processed: ${documentsProcessed}`);
    console.log(`   In target towns:   ${interesting.length}`);
    console.log(`   Signals inserted:  ${signalsCreated}`);

  } catch (err) {
    console.error('\n❌ Fatal:', err);
    await finishScanRun(scanRunId, { documentsProcessed, signalsCreated, errorMessage: err.message });
    if (debug) await page.screenshot({ path: path.join(DEBUG_DIR, 'fatal.png'), fullPage: true }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

// ── Parse the text-based ALIS results page ─────────────────────────────────
//
// Each record looks like:
//   Bk-Pg:43075-394                 Recorded: 04-30-2026 @ 9:00:00am  Inst #: 27485
//   Pages in document: 2
//   Grp: 1
//   Type: ASSIGNMENT
//   Desc: MTG
//   Town: CANTON  Addr: 11 GLEN ROAD
//   Gtor:	CAPITAL ONE N A (Gtor)
//   Gtee:	MORTGAGE ELECTRONIC ... (Gtee)

function parseRecords(text) {
  const records = [];
  // Split on Bk-Pg: which begins each record
  const chunks = text.split(/(?=Bk-Pg:)/);
  for (const chunk of chunks) {
    if (!chunk.startsWith('Bk-Pg:')) continue;

    const bkPg = (chunk.match(/Bk-Pg:\s*(\S+)/) || [])[1] || null;
    const recorded = (chunk.match(/Recorded:\s*([\d-]+)/) || [])[1] || null;
    const instNum = (chunk.match(/Inst\s*#:\s*(\d+)/) || [])[1] || null;
    const docType = (chunk.match(/Type:\s*([^\n]+?)(?=\s*\n)/) || [])[1]?.trim() || null;
    const desc = (chunk.match(/Desc:\s*([^\n]+?)(?=\s*\n)/) || [])[1]?.trim() || null;

    const townMatch = chunk.match(/Town:\s*([^\n]+?)\s+Addr:\s*([^\n]+?)(?=\s*\n)/);
    let town = townMatch?.[1]?.trim() || null;
    let address = townMatch?.[2]?.trim() || null;
    // When ALIS filters by town, only "Addr:" appears (Town is implied)
    if (!address) {
      const addrOnly = chunk.match(/Addr:\s*([^\n]+?)(?=\s*\n)/);
      address = addrOnly?.[1]?.trim() || null;
    }

    // Extract grantors and grantees (multiple possible)
    const grantors = [];
    const grantees = [];
    const gtorRegex = /Gtor:\s*([^\n]+?)\s*\(Gtor\)/g;
    const gteeRegex = /Gtee:\s*([^\n]+?)\s*\(Gtee\)/g;
    let m;
    while ((m = gtorRegex.exec(chunk)) !== null) grantors.push(m[1].trim());
    while ((m = gteeRegex.exec(chunk)) !== null) grantees.push(m[1].trim());

    if (!bkPg || !docType) continue;
    records.push({
      bookPage: bkPg, recordedDate: recorded, instNum,
      docType, desc, town, address, grantors, grantees,
      raw: chunk.slice(0, 2000),
    });
  }
  return records;
}

// ── Process one record: match property + insert signal ────────────────────

async function processRecord(rec) {
  const docId = `${SOURCE_KEY}:${rec.bookPage}`;

  // Dedupe
  const { data: existing } = await supabase
    .from('signals')
    .select('id')
    .eq('source', SOURCE_KEY)
    .eq('document_id', docId)
    .maybeSingle();
  if (existing) return false;

  if (!rec.address) return false;

  // Match against properties (address + town)
  const match = await matchPropertyByAddress({
    street: rec.address,
    city: rec.town,
  });
  if (!match.propertyId || match.confidence < 0.4) return false;

  // Map to signal type
  const docTypeUpper = (rec.docType || '').toUpperCase().trim();
  const signalType = DOC_TYPE_TO_SIGNAL.get(docTypeUpper) || 'unknown';
  if (signalType === 'unknown') return false;

  // Filing date
  const dateMatch = (rec.recordedDate || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const filingDate = dateMatch ? `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}` : null;

  // Build deep-link to the ALIS book/page lookup. Format observed:
  //   /ALIS/WW400R.HTM?WSIQTP=LR04D&WSKYCD=B&WSBOOK=<book>&WSPAGE=<page>
  // The user can click and ALIS will jump straight to the indexed record.
  const [book, pageNum] = (rec.bookPage || '').split('-');
  const docUrl = book && pageNum
    ? `https://www.norfolkresearch.org/ALIS/WW400R.HTM?WSIQTP=LR04D&WSKYCD=B&WSBOOK=${book}&WSPAGE=${pageNum}`
    : SOURCE_URL;

  const { error } = await supabase.from('signals').insert({
    property_id: match.propertyId,
    signal_type: signalType,
    source: SOURCE_KEY,
    source_url: docUrl,
    document_id: docId,
    filing_date: filingDate,
    raw_text: rec.raw,
    parsed_data: {
      book_page: rec.bookPage,
      book,
      page: pageNum,
      inst_num: rec.instNum,
      doc_type_raw: rec.docType,
      desc: rec.desc,
      town: rec.town,
      address: rec.address,
      grantors: rec.grantors,
      grantees: rec.grantees,
      amount_owed: null,  // ALIS text doesn't expose dollar amounts in the listing
      registry_home: SOURCE_URL,
    },
    match_confidence: match.confidence,
  });
  if (error) throw error;
  return true;
}

main().catch(err => { console.error(err); process.exit(1); });
