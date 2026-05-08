// Essex South Registry scanner — new SPA at salemdeeds.com/MASEARCHES
// Built on Angular DevExtreme widgets (dx-date-box, dx-tag-box, dx-data-grid).
// Search URL: /MASEARCHES/rec-date-search   Results URL: /MASEARCHES/rec-date-result-pg
//
// Run:  node registries/essex_spa.js              (yesterday)
//       node registries/essex_spa.js --debug
//       node registries/essex_spa.js --days=90

import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';
import { supabase, startScanRun, finishScanRun, getIncrementalDateRange } from '../lib/supabase.js';
import { matchPropertyByAddress } from '../lib/address.js';

const SOURCE_KEY = 'essex_south_registry';
const SEARCH_URL = 'https://salemdeeds.com/MASEARCHES/rec-date-search';

const TOWNS = ['MARBLEHEAD'];

// Filter labels (full names) for the dropdown picker
const DOC_FILTER_LABELS = [
  'LIS PENDENS', 'ORDER OF NOTICE',
  'TAX LIEN', 'TAX TAKING', 'TAKING', 'INSTRUMENT OF TAKING', 'ORDER OF TAKING',
  'LIEN', 'NOTICE',
];

// Result-grid abbreviations → signal type. Salem returns short codes like "ORDR NOTC".
const DOC_TYPES = {
  // Lis Pendens / foreclosure
  'LIS PENDENS':       'lis_pendens',
  'LIS PEND':          'lis_pendens',
  'LP':                'lis_pendens',
  'ORDER OF NOTICE':   'lis_pendens',
  'ORDR NOTC':         'lis_pendens',
  'ORDER NOTICE':      'lis_pendens',
  'ORDER NOTC':        'lis_pendens',
  // Tax taking
  'TAX LIEN':              'tax_taking',
  'TAX TAKING':            'tax_taking',
  'TAKING':                'tax_taking',
  'INSTRUMENT OF TAKING':  'tax_taking',
  'INST TAKG':             'tax_taking',
  'ORDER OF TAKING':       'tax_taking',
  'ORDR TAKG':             'tax_taking',
  'TAX LN':                'tax_taking',
  // Mechanic's lien
  'LIEN':              'mechanics_lien',
  'NOTICE':            'mechanics_lien',
};

// Marblehead's grid truncates city to 4 chars ("MARB"). Map back to full name.
const CITY_NORM = {
  'MARB': 'MARBLEHEAD',
  'MARBLEHEAD': 'MARBLEHEAD',
};

const args = process.argv.slice(2);
const debug = args.includes('--debug');
const sinceLast = args.includes('--since-last');
const daysArg = args.find(a => a.startsWith('--days='));
const daysBack = daysArg ? parseInt(daysArg.split('=')[1], 10) : parseInt(process.env.SCAN_DAYS_BACK || '1', 10);

const DEBUG_DIR = path.resolve('./debug-essex_spa');
const docTypeLabels = DOC_FILTER_LABELS;

const fmtMMDDYYYY = d => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
};

async function typeDxDate(page, selector, mmddyyyy) {
  const input = page.locator(selector).first();
  await input.click();
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await input.press('Control+A');
  await input.press('Delete');
  await page.waitForTimeout(150);
  await page.keyboard.type(mmddyyyy, { delay: 80 });
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
}

async function selectDxTagBoxOption(page, placeholder, value) {
  const input = page.locator(`input[placeholder*="${placeholder}"]`).first();
  await input.click();
  await page.waitForTimeout(300);
  await input.fill(value);
  await page.waitForTimeout(1200);
  // Click the matching dx-list-item
  const opt = page.locator('div.dx-item.dx-list-item').filter({ hasText: new RegExp(`^${value}$`, 'i') }).first();
  if (await opt.count()) {
    await opt.click({ timeout: 5_000 });
    await page.waitForTimeout(800);
  }
  // Tap escape to close dropdown
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

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

  console.log(`\n🔍 Scanning ${SOURCE_KEY} (DevExtreme SPA)`);
  console.log(`   URL:        ${SEARCH_URL}`);
  console.log(`   Date range: ${fmtMMDDYYYY(dateFrom)} → ${fmtMMDDYYYY(today)}`);
  console.log(`   Towns:      ${TOWNS.join(', ')}`);
  console.log(`   Doc types:  ${docTypeLabels.join(', ')}`);
  console.log(`   Mode:       ${debug ? 'DEBUG' : 'production'}\n`);

  const scanRunId = await startScanRun(SOURCE_KEY);
  let documentsProcessed = 0;
  let signalsCreated = 0;

  const browser = await chromium.launch({ channel: 'chrome', headless: !debug });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  try {
    console.log(`📂 Loading ${SEARCH_URL}...`);
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(4000);

    console.log('📅 Setting date range...');
    await typeDxDate(page, 'dx-date-box[name="datefrom"] input.dx-texteditor-input', fmtMMDDYYYY(dateFrom));
    await typeDxDate(page, 'dx-date-box[name="dateto"] input.dx-texteditor-input', fmtMMDDYYYY(today));

    console.log('🏛️  Selecting towns...');
    for (const town of TOWNS) {
      await selectDxTagBoxOption(page, 'All Towns', town);
    }

    console.log('📋 Selecting doc types...');
    for (const dt of docTypeLabels) {
      await selectDxTagBoxOption(page, 'All Doc Types', dt);
    }

    if (debug) await page.screenshot({ path: path.join(DEBUG_DIR, '01_filled.png'), fullPage: true });

    console.log('🔎 Submitting...');
    await page.locator('button').filter({ hasText: /^\s*SEARCH\s*$/i }).first().click({ timeout: 8_000 });

    // Wait for results page or "No records found"
    console.log('   Waiting for results...');
    await page.waitForTimeout(4000);
    for (let i = 0; i < 30; i++) {
      const stillLoading = await page.evaluate(() => /^Loading\.\.\.$/.test((document.body.innerText.match(/Loading\.\.\./)?.[0] || '')));
      if (!stillLoading) break;
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(3000);

    if (debug) await page.screenshot({ path: path.join(DEBUG_DIR, '02_results.png'), fullPage: true });

    // Read result count + extract rows from the dx-data-grid
    const summary = await page.evaluate(() => {
      const text = document.body.innerText;
      const countMatch = text.match(/(\d+)\s+records found/i);
      return {
        count: countMatch ? parseInt(countMatch[1], 10) : 0,
        noRecords: /No records found/i.test(text),
      };
    });
    console.log(`   Result: ${summary.count} records, noRecords=${summary.noRecords}`);

    if (summary.noRecords || summary.count === 0) {
      await finishScanRun(scanRunId, { documentsProcessed: 0, signalsCreated: 0 });
      console.log('\n✅ Scan complete (no records).');
      return;
    }

    // Extract rows from the data grid (use header text to map columns instead of fixed indices)
    const rows = await page.evaluate(() => {
      // Find header cells to map column position → name
      const headerCells = [...document.querySelectorAll('td.dx-header-row > td, tr.dx-header-row td')]
        .filter(td => td.offsetParent !== null);
      const headerNames = headerCells.length
        ? headerCells.map(td => (td.textContent || '').trim().toLowerCase())
        : [];
      const dataRows = [...document.querySelectorAll('tr.dx-row.dx-data-row')]
        .filter(tr => tr.offsetParent !== null);
      return dataRows.map(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => (td.textContent || '').trim());
        const get = name => {
          const idx = headerNames.findIndex(h => h.includes(name));
          return idx >= 0 ? (cells[idx] || '') : '';
        };
        return {
          date: get('date'),
          firstGrantor: get('grantor'),
          firstGrantee: get('grantee'),
          docType: get('type'),
          description: get('description'),
          address: get('address'),
          cityTown: get('city'),
          bookPage: get('book'),
          rawCells: cells,
          headerNames,
        };
      });
    });

    if (debug || rows.length === 0) {
      console.log(`   Header row: ${JSON.stringify(rows[0]?.headerNames || [])}`);
      console.log(`   First row cells: ${JSON.stringify(rows[0]?.rawCells || [])}`);
    }
    console.log(`   Extracted ${rows.length} rows from grid`);
    documentsProcessed = rows.length;

    for (const r of rows) {
      const signalType = DOC_TYPES[(r.docType || '').toUpperCase().trim()] || null;
      if (!signalType) {
        console.log(`   skip unknown doctype: "${r.docType}"`);
        continue;
      }
      if (!r.address) {
        console.log(`   skip ${r.bookPage} no address`);
        continue;
      }
      const cityFull = CITY_NORM[(r.cityTown || '').toUpperCase().trim()] || r.cityTown;
      // Dedup
      const docId = `${SOURCE_KEY}:${r.bookPage}`;
      const { data: existing } = await supabase.from('signals')
        .select('id').eq('source', SOURCE_KEY).eq('document_id', docId).maybeSingle();
      if (existing) {
        console.log(`   skip ${r.bookPage} dupe`);
        continue;
      }

      const match = await matchPropertyByAddress({ street: r.address, city: cityFull });
      if (!match.propertyId || match.confidence < 0.3) {
        console.log(`   skip ${r.bookPage} no match (conf=${match.confidence?.toFixed(2)})`);
        continue;
      }

      const fd = (r.date || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      const filingDate = fd ? `${fd[3]}-${fd[1].padStart(2,'0')}-${fd[2].padStart(2,'0')}` : null;

      // Construct deep-link to the document on Salem's MASEARCHES SPA.
      // Format observed: <base>/document?book=BOOK&page=PAGE
      const [book, pageNum] = (r.bookPage || '').split('/');
      const docUrl = book && pageNum
        ? `https://salemdeeds.com/MASEARCHES/document?book=${book}&page=${pageNum}`
        : SEARCH_URL;

      const { error } = await supabase.from('signals').insert({
        property_id: match.propertyId,
        signal_type: signalType,
        source: SOURCE_KEY,
        source_url: docUrl,
        document_id: docId,
        filing_date: filingDate,
        raw_text: JSON.stringify(r).slice(0, 4000),
        parsed_data: {
          street: r.address, city: cityFull, city_raw: r.cityTown, doc_type_raw: r.docType,
          grantors: [r.firstGrantor], grantees: [r.firstGrantee],
          book, page: pageNum,
          amount_owed: null,
          registry_home: SEARCH_URL,
        },
        match_confidence: match.confidence,
      });
      if (error) {
        console.log(`   ⚠️ insert err ${r.bookPage}: ${error.message}`);
      } else {
        signalsCreated++;
        console.log(`   ✓ ${signalType} ${r.bookPage} ${r.address}, ${cityFull}`);
      }
    }

    await finishScanRun(scanRunId, { documentsProcessed, signalsCreated });
    console.log(`\n✅ Scan complete.`);
    console.log(`   Rows: ${documentsProcessed}, Signals: ${signalsCreated}`);

  } catch (err) {
    console.error('\n❌ Fatal:', err.message);
    await finishScanRun(scanRunId, { documentsProcessed, signalsCreated, errorMessage: err.message });
    if (debug) await page.screenshot({ path: path.join(DEBUG_DIR, 'fatal.png'), fullPage: true }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
