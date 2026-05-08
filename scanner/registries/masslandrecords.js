// Scanner for masslandrecords.com platform.
// Covers: Suffolk, MiddlesexSouth, MiddlesexNorth (3 of our 6 registries).
//
// Workflow:
//   1. Open registry URL
//   2. Switch to "Recorded Date Search", click "Advanced"
//   3. Set date range, multi-select doc types, multi-select towns
//   4. Search → collect rows across pagination
//   5. For each row, click the book/page cell link → detail expands inline below
//   6. Parse the expanded detail block: Street # / Street Name + Grantor/Grantee
//   7. Fuzzy-match address against properties table
//   8. Insert signal row (deduped by source + document_id)
//
// Run:  node registries/masslandrecords.js suffolk            (yesterday, headless)
//       node registries/masslandrecords.js suffolk --debug    (yesterday, visible browser)
//       node registries/masslandrecords.js suffolk --days=7   (last 7 days)

import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir, writeFile, appendFile } from 'fs/promises';
import path from 'path';
import { supabase, startScanRun, finishScanRun, getIncrementalDateRange } from '../lib/supabase.js';
import { matchPropertyByAddress } from '../lib/address.js';

// ── Registry configurations ───────────────────────────────────────────────
// Each registry uses different doc-type labels for the same legal concepts.
// We map each registry's actual labels to our 3 signal types.

const REGISTRIES = {
  suffolk: {
    sourceKey: 'suffolk_registry',
    url: 'http://www.masslandrecords.com/Suffolk',
    towns: ['BOSTON'],
    docTypes: {
      'LIS PENDENS':           'lis_pendens',
      'ORDER OF TAKING':       'tax_taking',
      'TAX LIEN':              'tax_taking',
      'INSTRUMENT OF TAKING':  'tax_taking',
      'LIEN':                  'mechanics_lien',
      'NOTICE':                'mechanics_lien',
    },
  },
  middlesex_south: {
    sourceKey: 'middlesex_south_registry',
    url: 'http://www.masslandrecords.com/MiddlesexSouth',
    towns: [
      'CAMBRIDGE', 'NEWTON', 'SOMERVILLE', 'MEDFORD', 'WATERTOWN', 'WALTHAM',
      'LEXINGTON', 'CONCORD', 'SUDBURY', 'WAYLAND', 'WINCHESTER', 'LINCOLN', 'WESTON',
    ],
    docTypes: {
      'LIS PENDENS (NOTICE OF SUIT)':  'lis_pendens',
      'ORDER OF NOTICE':                'lis_pendens',
      'TAX LIEN':                       'tax_taking',
      'TAKING':                         'tax_taking',
      'NOTICE OF MASS TAX LIEN':        'tax_taking',
      'NOTICE OF FEDERAL TAX LIEN':     'tax_taking',
      'LIEN':                           'mechanics_lien',
      'NOTICE':                         'mechanics_lien',
    },
  },
  middlesex_north: {
    sourceKey: 'middlesex_north_registry',
    url: 'http://www.masslandrecords.com/MiddlesexNorth',
    towns: ['CARLISLE'],
    docTypes: {
      'LIS PENDENS':       'lis_pendens',
      'ORDER OF NOTICE':   'lis_pendens',
      'MASS TAX LIEN':     'tax_taking',
      'TAKING':            'tax_taking',
      'FEDERAL TAX LIEN':  'tax_taking',
      'LIEN':              'mechanics_lien',
      'NOTICE':            'mechanics_lien',
    },
  },
  // Plymouth + Essex South use Avenu but different layouts — separate scrapers
};

// ── CLI argument parsing ──────────────────────────────────────────────────

const args = process.argv.slice(2);
const registryKey = args[0];
const debug = args.includes('--debug');
const sinceLast = args.includes('--since-last');
const daysArg = args.find(a => a.startsWith('--days='));
const daysBack = daysArg ? parseInt(daysArg.split('=')[1], 10) : parseInt(process.env.SCAN_DAYS_BACK || '1', 10);

if (!registryKey || !REGISTRIES[registryKey]) {
  console.error(`Usage: node registries/masslandrecords.js <registry> [--debug] [--days=N]`);
  console.error(`Available: ${Object.keys(REGISTRIES).join(', ')}`);
  process.exit(1);
}
const cfg = REGISTRIES[registryKey];
const DEBUG_DIR = path.resolve(`./debug-${registryKey}`);

// ── Date helpers ──────────────────────────────────────────────────────────

const fmtMDY = d => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
const fmtISO = d => d.toISOString().slice(0, 10);

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(DEBUG_DIR, { recursive: true });

  let today, dateTo, dateFrom;
  if (sinceLast) {
    const range = await getIncrementalDateRange(cfg.sourceKey, 7);
    today = range.dateTo;
    dateTo = range.dateTo;
    dateFrom = range.dateFrom;
  } else {
    today = new Date();
    dateTo = today;
    dateFrom = new Date(today.getTime() - (daysBack - 1) * 24 * 60 * 60 * 1000);
  }

  const docTypeLabels = Object.keys(cfg.docTypes);

  console.log(`\n🔍 Scanning ${cfg.sourceKey}`);
  console.log(`   URL:        ${cfg.url}`);
  console.log(`   Date range: ${fmtMDY(dateFrom)} → ${fmtMDY(dateTo)}`);
  console.log(`   Towns:      ${cfg.towns.join(', ')}`);
  console.log(`   Doc types:  ${docTypeLabels.join(', ')}`);
  console.log(`   Mode:       ${debug ? 'DEBUG (visible browser)' : 'production (headless)'}\n`);

  const scanRunId = await startScanRun(cfg.sourceKey);
  let documentsProcessed = 0;
  let signalsCreated = 0;

  // Imperva (the CDN protecting masslandrecords.com) blocks Playwright's bundled
  // Chromium in headless mode. Use installed Chrome instead — its fingerprint
  // matches a legitimate browser. Falls back to Chromium if Chrome isn't installed.
  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: !debug,
      args: !debug ? ['--disable-blink-features=AutomationControlled', '--no-sandbox'] : [],
    });
  } catch (e) {
    console.log(`   ⚠️ Chrome not found, falling back to bundled Chromium`);
    browser = await chromium.launch({
      headless: !debug,
      args: !debug ? ['--disable-blink-features=AutomationControlled', '--no-sandbox'] : [],
    });
  }
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Ch-Ua': '"Chromium";v="121", "Not(A:Brand";v="24", "Google Chrome";v="121"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
    },
  });
  // Hide webdriver flag
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await ctx.newPage();

  try {
    // Step 1: Run the search
    console.log(`📂 Loading ${cfg.url}...`);
    await page.goto(cfg.url, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(3000);

    // Defensive: if dropdown not found, dump what's on the page so we can debug
    try {
      await page.waitForSelector('#SearchCriteriaName1_DDL_SearchName', { timeout: 15_000 });
    } catch (waitErr) {
      const url = page.url();
      const title = await page.title();
      const html = await page.content();
      const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 1500) || '');
      await writeFile(path.join(DEBUG_DIR, 'headless_failure.html'), html);
      await page.screenshot({ path: path.join(DEBUG_DIR, 'headless_failure.png'), fullPage: true });
      console.error(`\n❌ Dropdown not found.`);
      console.error(`   Current URL:  ${url}`);
      console.error(`   Page title:   ${title}`);
      console.error(`   Body preview:\n${bodyText}\n`);
      throw waitErr;
    }

    await page.selectOption('#SearchCriteriaName1_DDL_SearchName', { label: 'Recorded Date Search' });
    await page.waitForTimeout(2500);

    await page.click('#SearchFormEx1_BtnAdvanced');
    await page.waitForTimeout(2500);

    await page.fill('#SearchFormEx1_DRACSTextBox_DateFrom', fmtMDY(dateFrom));
    await page.fill('#SearchFormEx1_DRACSTextBox_DateTo', fmtMDY(dateTo));

    // Validate per-registry doc type labels actually exist in the dropdown
    const availableDocTypes = await page.$$eval(
      '#SearchFormEx1_ACSDropDownList_DocumentType option',
      opts => opts.map(o => o.text.trim())
    );
    const validDocTypes = docTypeLabels.filter(l => availableDocTypes.includes(l));
    const missingDocTypes = docTypeLabels.filter(l => !availableDocTypes.includes(l));
    if (missingDocTypes.length) {
      console.log(`   ⚠️ Configured doc types not in dropdown: ${missingDocTypes.join(', ')}`);
    }
    console.log(`   Selecting: ${validDocTypes.join(', ')}`);
    await page.selectOption('#SearchFormEx1_ACSDropDownList_DocumentType',
      validDocTypes.map(label => ({ label })));

    const availableTowns = await page.$$eval(
      '#SearchFormEx1_ACSDropDownList_Towns option',
      opts => opts.map(o => o.text.trim())
    );
    const validTowns = cfg.towns.filter(t => availableTowns.includes(t));
    const missingTowns = cfg.towns.filter(t => !availableTowns.includes(t));
    if (missingTowns.length) {
      console.log(`   ⚠️ Towns not in this registry's dropdown: ${missingTowns.join(', ')}`);
    }
    if (validTowns.length) {
      console.log(`   Selecting towns: ${validTowns.join(', ')}`);
      await page.selectOption('#SearchFormEx1_ACSDropDownList_Towns',
        validTowns.map(label => ({ label })));
    } else {
      console.log(`   ⚠️ No matching towns — running without town filter (will be slow)`);
    }

    if (debug) await page.screenshot({ path: path.join(DEBUG_DIR, '01_form.png'), fullPage: true });

    console.log(`🔎 Submitting search...`);
    await page.click('#SearchFormEx1_btnSearch');
    await page.waitForTimeout(8000);

    if (debug) await page.screenshot({ path: path.join(DEBUG_DIR, '02_results.png'), fullPage: true });

    // Step 2 + 3: Process page-by-page.
    // CRITICAL: link IDs reset per page (each page has rowIdx 0..N), so we MUST
    // process all rows on the current page before paginating, or clicks will hit
    // the wrong rows when we try to use stored link IDs after navigation.
    let successful = 0;
    let pageNum = 1;
    let totalRows = 0;

    while (true) {
      console.log(`\n📄 Page ${pageNum}:`);
      const pageRows = await extractPageRows(page);
      const interesting = pageRows.filter(r => cfg.towns.includes((r.town || '').toUpperCase()));
      console.log(`   ${pageRows.length} total, ${interesting.length} in target towns`);
      totalRows += pageRows.length;

      for (let i = 0; i < interesting.length; i++) {
        const row = interesting[i];
        try {
          const result = await processRow(page, row, cfg);
          const status = result?.status || 'skipped';
          console.log(`   ${i + 1}/${interesting.length} ${row.docType.padEnd(28)} ${row.bookPage.padEnd(12)} → ${status}`);
          if (result?.inserted) signalsCreated++;
          if (result?.success) successful++;
        } catch (err) {
          console.error(`   ${i + 1}/${interesting.length} ${row.docType} ${row.bookPage} → ERROR: ${err.message}`);
          await appendFile(path.join(DEBUG_DIR, 'errors.log'), `${new Date().toISOString()} ${row.bookPage}: ${err.message}\n`);
        }
        await page.waitForTimeout(400);
      }

      // Try to advance to next page
      const next = await page.$('a:has-text("Next"):not(:has-text("Previous"))');
      if (!next || !(await next.isEnabled().catch(() => false))) {
        console.log(`   (no more pages)`);
        break;
      }
      await next.click();
      await page.waitForTimeout(2500);
      pageNum++;
      if (pageNum > 100) { console.log(`   reached 100-page safety limit`); break; }
    }
    documentsProcessed = totalRows;

    await finishScanRun(scanRunId, { documentsProcessed, signalsCreated });

    console.log(`\n✅ Scan complete.`);
    console.log(`   Pages scanned:          ${pageNum}`);
    console.log(`   Filings seen:           ${documentsProcessed}`);
    console.log(`   Successfully extracted: ${successful}`);
    console.log(`   Signals inserted:       ${signalsCreated}`);

  } catch (err) {
    console.error('\n❌ Fatal:', err);
    await finishScanRun(scanRunId, { documentsProcessed, signalsCreated, errorMessage: err.message });
    if (debug) await page.screenshot({ path: path.join(DEBUG_DIR, 'fatal.png'), fullPage: true }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

async function extractPageRows(page) {
  return await page.$$eval('tr.DataGridRow', trs =>
    trs.map(tr => {
      const cells = tr.querySelectorAll('td');
      const cb = cells[0]?.querySelector('input[type="checkbox"]');
      const bookPageLink = cells[2]?.querySelector('a');
      return {
        rowIdx: cb?.id?.replace('chkDocList1_GridView_Document', '') || null,
        fileDate: cells[1]?.textContent?.trim() || '',
        bookPage: cells[2]?.textContent?.trim() || '',
        docType:  cells[3]?.textContent?.trim() || '',
        town:     cells[4]?.textContent?.trim() || '',
        linkId:   bookPageLink?.id || null,
      };
    })
  );
}

// ── Process one row: navigate to its page, click into detail, extract, match, insert

async function processRow(page, row, cfg) {
  // Dedupe early
  const docId = `${cfg.sourceKey}:${row.bookPage}`;
  const { data: existing } = await supabase
    .from('signals')
    .select('id')
    .eq('source', cfg.sourceKey)
    .eq('document_id', docId)
    .maybeSingle();
  if (existing) return { status: 'skip:dupe' };

  // Make sure we're on the right page (clicking detail doesn't change pagination,
  // but we may have advanced past this row's page during collection).
  // For simplicity: re-search if needed. (Optimization: track current page.)
  // For v1 we processed rows in order so they should already be visible.
  // Click the book/page link to expand the detail inline.
  if (!row.linkId) return { status: 'skip:no_link' };

  // CSS-escape forward slash in id
  const selector = '#' + row.linkId.replace(/\//g, '\\/');
  const link = await page.$(selector);
  if (!link) return { status: 'skip:link_not_visible' };

  await link.click();
  await page.waitForTimeout(1800);

  // Parse the detail block. The detail is appended below the search results,
  // structured as: Doc # / Date / Type / etc, then Street # / Street Name table,
  // then Grantor/Grantee table, then References table.
  const detail = await parseDetail(page, row);
  if (!detail.streetNumber || !detail.streetName) {
    return { status: 'skip:no_address' };
  }

  // Build address for matching
  const street = `${detail.streetNumber} ${detail.streetName}`.trim();
  const match = await matchPropertyByAddress({ street, city: row.town });
  if (!match.propertyId || match.confidence < 0.3) {
    return { status: `skip:no_match(conf=${match.confidence?.toFixed(2)})` };
  }

  // Determine signal type using THIS registry's doc-type map
  const signalType = cfg.docTypes[row.docType] || 'unknown';
  if (signalType === 'unknown') {
    return { status: `skip:unknown_doctype(${row.docType})` };
  }

  // Filing date
  const fd = (row.fileDate || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const filingDate = fd ? `${fd[3]}-${fd[1].padStart(2, '0')}-${fd[2].padStart(2, '0')}` : null;

  // Build a source URL for the document.
  // Prefer Document.aspx?id=DOCNUMBER when we have a doc number (requires active session,
  // but is the actual page). Fall back to the book/page search URL which works without a session.
  const [book, pageNum] = (row.bookPage || '').split('/');
  const docUrl = detail.docNumber
    ? `${cfg.url}/Document.aspx?id=${detail.docNumber}`
    : (book && pageNum ? `${cfg.url}/SearchResults.aspx?SearchType=BookPage&book=${book}&page=${pageNum}` : cfg.url);

  // Tax-taking amounts: masslandrecords sometimes encodes the dollar amount
  // in `consideration`. For tax_taking signals we also expose it as amount_owed
  // so the UI can show "$5,293 owed" without inspecting the raw blob.
  const amountOwed = signalType === 'tax_taking'
    ? (detail.consideration || null)
    : null;

  // Insert signal
  const { error } = await supabase.from('signals').insert({
    property_id: match.propertyId,
    signal_type: signalType,
    source: cfg.sourceKey,
    source_url: docUrl,
    document_id: docId,
    filing_date: filingDate,
    raw_text: detail.rawText.slice(0, 4000),
    parsed_data: {
      street, city: row.town, doc_type_raw: row.docType,
      grantors: detail.grantors, grantees: detail.grantees,
      consideration: detail.consideration,
      amount_owed: amountOwed,
      doc_number: detail.docNumber,
      book,
      page: pageNum,
      references: detail.references,
      registry_home: cfg.url,
    },
    match_confidence: match.confidence,
  });
  if (error) throw new Error(`insert failed: ${error.message}`);

  return {
    status: `inserted (${signalType}, conf=${match.confidence.toFixed(2)})  ${street}, ${row.town}`,
    inserted: true,
    success: true,
  };
}

// ── Parse the inline detail block that appears after clicking a row ────────

async function parseDetail(page, row) {
  return await page.evaluate(() => {
    const text = document.body.innerText;
    const result = {
      docNumber: null, consideration: null,
      streetNumber: null, streetName: null,
      grantors: [], grantees: [], references: [],
      rawText: '',
    };

    // Find the detail section — it begins with "Doc. #" header line
    const docHeaderIdx = text.lastIndexOf('Doc. #');
    if (docHeaderIdx < 0) return result;
    const detailText = text.slice(docHeaderIdx);
    result.rawText = detailText;

    // Doc # and Consideration come on the line after the headers
    // Headers: "Doc. #\tFile Date\tRec Time\tType Desc.\t# of Pgs.\tBook/Page\tConsideration\tDoc. Status"
    // Data:    "25263\t04/30/2026\t11:34:49.315\tLIEN\t3\t72702/38\t0.00\tIn workflow"
    const docRowMatch = detailText.match(/Doc\. Status\s*\n?\s*(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d:.]+)\s+([A-Z][A-Z ]*)\s+(\d+)\s+([\d/]+)\s+([\d.]+)\s+(.+?)\n/);
    if (docRowMatch) {
      result.docNumber = docRowMatch[1];
      result.consideration = parseFloat(docRowMatch[7]) || 0;
    }

    // Street section: cells are tab-separated. Find the line after "Street #" header
    // and split by tab to get clean cells (avoid greedy regex pulling city across tabs).
    const lines = detailText.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (/Street #/i.test(lines[i]) && /Street Name/i.test(lines[i])) {
        // The next non-blank line holds the cell data, tab-separated
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const dataLine = lines[j].replace(/^\s+|\s+$/g, '');
          if (!dataLine) continue;
          const cells = dataLine.split(/\t+|\s{2,}/).map(c => c.trim()).filter(Boolean);
          if (cells.length >= 2 && /^\d/.test(cells[0])) {
            result.streetNumber = cells[0];
            result.streetName   = cells[1];
            break;
          }
        }
        break;
      }
    }

    // Grantor/Grantee section
    const ggMatch = detailText.match(/Grantor\/Grantee[\s\S]*?(?=References|$)/);
    if (ggMatch) {
      const lines = ggMatch[0].split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const m = line.match(/^(.+?)\s+(Grantor|Grantee)$/);
        if (m) {
          if (m[2] === 'Grantor') result.grantors.push(m[1].trim());
          else result.grantees.push(m[1].trim());
        }
      }
    }

    // References section
    const refMatch = detailText.match(/References[\s\S]*$/);
    if (refMatch) {
      const lines = refMatch[0].split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const m = line.match(/^(\d+\/\d+)\s+(\w+)\s+(\d{4})$/);
        if (m) result.references.push({ bookPage: m[1], type: m[2], year: m[3] });
      }
    }

    return result;
  });
}

main().catch(err => { console.error(err); process.exit(1); });
