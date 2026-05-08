// Plymouth Registry scanner (Avenu titleview legacy platform).
// Form selectors (#SearchFormEx1_*) require clicking "Search Criteria" menu
// then "Date Range" link to load the date-range form.
// NOTE: Essex South migrated to a new SPA — see registries/essex_spa.js.
//
// Run:  node registries/titleview.js plymouth        (yesterday)
//       node registries/titleview.js plymouth --debug

import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir, writeFile, appendFile } from 'fs/promises';
import path from 'path';
import { supabase, startScanRun, finishScanRun, getIncrementalDateRange } from '../lib/supabase.js';
import { matchPropertyByAddress } from '../lib/address.js';

// ── Registry configurations ───────────────────────────────────────────────

const REGISTRIES = {
  plymouth: {
    sourceKey: 'plymouth_registry',
    url: 'http://titleview.org/plymouthdeeds/',
    towns: ['HINGHAM', 'SCITUATE', 'DUXBURY'],
    // Plymouth grid abbreviates town in column 10 (4-5 chars, varies)
    townAbbrev: {
      'HNGHM':    'HINGHAM',
      'HINGHAM':  'HINGHAM',
      'SCIT':     'SCITUATE',
      'SCITUATE': 'SCITUATE',
      'DXBY':     'DUXBURY',
      'DUXBURY':  'DUXBURY',
    },
    // Filter labels for the dropdown picker (full names, lowercased match in option text)
    docFilterLabels: [
      'LIS PENDENS', 'ORDER OF NOTICE',
      'TAX LIEN', 'TAX TAKING', 'TAKING', 'INSTRUMENT OF TAKING', 'ORDER OF TAKING',
      'LIEN', 'NOTICE', 'JUDGMENT', 'ATTACHMENT', 'NOTICE OF ATT',
    ],
    // Result-grid abbreviations → signal type
    docTypes: {
      // Lis pendens / foreclosure orders
      'LIS PENDENS':       'lis_pendens',
      'LIS PEND':          'lis_pendens',
      'LP':                'lis_pendens',
      'ORDR NOTC':         'lis_pendens',
      'ORDER OF NOTICE':   'lis_pendens',
      // Tax taking
      'TAX LIEN':              'tax_taking',
      'TAX TAKING':            'tax_taking',
      'TAKING':                'tax_taking',
      'TKG':                   'tax_taking',
      'TT':                    'tax_taking',
      'INSTRUMENT OF TAKING':  'tax_taking',
      'ORDER OF TAKING':       'tax_taking',
      // Mechanic's lien
      'LIEN':              'mechanics_lien',
      'PR LIEN':           'mechanics_lien',
      'NOTICE':            'mechanics_lien',
      'ATTACHMENT':        'mechanics_lien',
      'JUDGMENT':          'mechanics_lien',
      'NOTICE OF ATT':     'mechanics_lien',
    },
  },
};

// ── CLI ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const registryKey = args[0];
const debug = args.includes('--debug');
const sinceLast = args.includes('--since-last');
const daysArg = args.find(a => a.startsWith('--days='));
const daysBack = daysArg ? parseInt(daysArg.split('=')[1], 10) : parseInt(process.env.SCAN_DAYS_BACK || '1', 10);

if (!registryKey || !REGISTRIES[registryKey]) {
  console.error(`Usage: node registries/titleview.js plymouth [--debug] [--days=N]`);
  process.exit(1);
}

const cfg = REGISTRIES[registryKey];
const DEBUG_DIR = path.resolve(`./debug-titleview-${registryKey}`);
const docTypeLabels = cfg.docFilterLabels;

const fmtMDY = d => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
const fmtMMDDYYYY = d => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
};

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(DEBUG_DIR, { recursive: true });
  let today, dateFrom;
  if (sinceLast) {
    const range = await getIncrementalDateRange(cfg.sourceKey, 7);
    today = range.dateTo;
    dateFrom = range.dateFrom;
  } else {
    today = new Date();
    dateFrom = new Date(today.getTime() - (daysBack - 1) * 24 * 60 * 60 * 1000);
  }

  console.log(`\n🔍 Scanning ${cfg.sourceKey}`);
  console.log(`   URL:        ${cfg.url}`);
  console.log(`   Date range: ${fmtMDY(dateFrom)} → ${fmtMDY(today)}`);
  console.log(`   Towns:      ${cfg.towns.join(', ')}`);
  console.log(`   Doc types:  ${docTypeLabels.join(', ')}`);
  console.log(`   Mode:       ${debug ? 'DEBUG' : 'production'}\n`);

  const scanRunId = await startScanRun(cfg.sourceKey);
  let documentsProcessed = 0;
  let signalsCreated = 0;

  const browser = await chromium.launch({ channel: 'chrome', headless: !debug });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  try {
    // Iterate per town to avoid the 1000-record cap that AND-style dropdown bug
    // and to give each town its own search budget.
    let totalRows = 0;
    for (const town of cfg.towns) {
      console.log(`\n🏛️  ${town}`);

      // 1. Load the registry page (fresh per town to keep state clean)
      await page.goto(cfg.url, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForTimeout(2500);

      // 2. Click "Search Criteria" menu
      const menuLabel = page.locator('#Navigator1_SearchCriteria1_menuLabel');
      if (await menuLabel.count() > 0) {
        await menuLabel.click();
        await page.waitForTimeout(1500);
      }

      // 3. Click "Date Range" under Recorded Land
      const dateRangeLink = page.locator('#Navigator1_SearchCriteria1_LinkButton03, a:has-text("Date Range"):visible').first();
      await dateRangeLink.click({ timeout: 10_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(2500);

      // 4. Click "Advanced" to reveal town filter
      const advBtn = await page.$('#SearchFormEx1_BtnAdvanced');
      if (advBtn) {
        await advBtn.click();
        await page.waitForTimeout(2000);
      }

      // 5. Fill date range
      await page.fill('#SearchFormEx1_DRACSTextBox_DateFrom', fmtMMDDYYYY(dateFrom));
      await page.fill('#SearchFormEx1_DRACSTextBox_DateTo', fmtMMDDYYYY(today));

      // 6. Select THIS town only
      const availableTowns = await page.$$eval(
        '#SearchFormEx1_ACSDropDownList_Towns option',
        opts => opts.map(o => o.text.trim())
      );
      if (!availableTowns.includes(town)) {
        console.log(`   ⚠️ town ${town} not in dropdown, skipping`);
        continue;
      }
      await page.selectOption('#SearchFormEx1_ACSDropDownList_Towns', { label: town });

      // 7. NO doc-type filter (Plymouth AND-bug — filter client-side)
      // 8. Submit
      await page.click('#SearchFormEx1_btnSearch');
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(4000);

      // 9. Paginate this town's results
      let pageNum = 1;
      let lastPageSignature = null;
      while (true) {
        const pageRows = await extractPageRows(page);
        const sig = pageRows.map(r => `${r.book}/${r.pageNo}/${r.docType}`).join('|');
        if (sig && sig === lastPageSignature) break;
        lastPageSignature = sig;

        const inTown = pageRows
          .map(r => ({ ...r, town: cfg.townAbbrev[r.townAbbrev] || r.townAbbrev }))
          .filter(r => r.town === town);
        totalRows += pageRows.length;
        if (pageNum % 5 === 1) {
          console.log(`   Page ${pageNum}: ${pageRows.length} rows, ${inTown.length} in ${town}`);
        }

        for (const row of inTown) {
          try {
            const result = await processRow(page, row, cfg);
            if (result?.inserted) {
              signalsCreated++;
              console.log(`   ✓ ${row.docType.padEnd(12)} ${row.bookPage} ${row.address}, ${row.town}`);
            }
          } catch (err) {
            console.error(`   ❌ ${row.docType} ${row.bookPage}: ${err.message}`);
          }
        }

        const next = await page.$('a:has-text("Next"):not(:has-text("Previous"))');
        if (!next || !(await next.isEnabled().catch(() => false))) break;
        await next.click();
        await page.waitForTimeout(2200);
        pageNum++;
        if (pageNum > 60) break;  // 60 pages × ~20 rows = 1200 records max per town
      }
      console.log(`   ${town}: ${pageNum} pages`);
    }
    documentsProcessed = totalRows;

    await finishScanRun(scanRunId, { documentsProcessed, signalsCreated });
    console.log(`\n✅ Scan complete.`);
    console.log(`   Total rows: ${totalRows}, Signals: ${signalsCreated}`);

  } catch (err) {
    console.error('\n❌ Fatal:', err);
    await finishScanRun(scanRunId, { documentsProcessed, signalsCreated, errorMessage: err.message });
    if (debug) await page.screenshot({ path: path.join(DEBUG_DIR, 'fatal.png'), fullPage: true }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

// Plymouth titleview grid columns:
// [0]checkbox  [1]OR-link  [2]Grantor  [3]Grantee  [4]DocNo  [5]Book  [6]Page
// [7]DocType   [8]FileDate  [9]Address  [10]TownAbbrev
async function extractPageRows(page) {
  return await page.$$eval('tr.DataGridRow, tr.DataGridAlternatingRow', trs =>
    trs.map(tr => {
      const cells = [...tr.querySelectorAll('td')].map(td => td.textContent?.trim() || '');
      return {
        grantor:    cells[2] || '',
        grantee:    cells[3] || '',
        docNo:      cells[4] || '',
        book:       cells[5] || '',
        pageNo:     cells[6] || '',
        bookPage:   `${cells[5] || ''}/${cells[6] || ''}`,
        docType:    (cells[7] || '').toUpperCase(),
        fileDate:   cells[8] || '',
        address:    cells[9] || '',
        townAbbrev: (cells[10] || '').toUpperCase(),
      };
    })
  );
}

// Plymouth grid has all data inline — no detail-page navigation needed.
async function processRow(page, row, cfg) {
  const docId = `${cfg.sourceKey}:${row.bookPage}`;
  const { data: existing } = await supabase
    .from('signals')
    .select('id')
    .eq('source', cfg.sourceKey)
    .eq('document_id', docId)
    .maybeSingle();
  if (existing) return { status: 'skip:dupe' };

  const signalType = cfg.docTypes[row.docType] || null;
  if (!signalType) return { status: `skip:unknown_doctype(${row.docType})` };

  if (!row.address) return { status: 'skip:no_address' };

  const match = await matchPropertyByAddress({ street: row.address, city: row.town });
  if (!match.propertyId || match.confidence < 0.3) {
    return { status: `skip:no_match(conf=${match.confidence?.toFixed(2)})` };
  }

  const fd = (row.fileDate || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const filingDate = fd ? `${fd[3]}-${fd[1].padStart(2, '0')}-${fd[2].padStart(2, '0')}` : null;

  const docUrl = row.book && row.pageNo
    ? `${cfg.url}/document.aspx?bp=${row.book}/${row.pageNo}`
    : cfg.url;

  const { error } = await supabase.from('signals').insert({
    property_id: match.propertyId,
    signal_type: signalType,
    source: cfg.sourceKey,
    source_url: docUrl,
    document_id: docId,
    filing_date: filingDate,
    raw_text: JSON.stringify(row).slice(0, 4000),
    parsed_data: {
      street: row.address, city: row.town, doc_type_raw: row.docType,
      grantors: [row.grantor].filter(Boolean), grantees: [row.grantee].filter(Boolean),
      doc_number: row.docNo, book: row.book, page: row.pageNo,
      amount_owed: null,  // titleview grid doesn't expose dollars; would need detail page
      registry_home: cfg.url,
    },
    match_confidence: match.confidence,
  });
  if (error) throw new Error(`insert failed: ${error.message}`);
  return { status: `inserted (${signalType}, conf=${match.confidence.toFixed(2)})  ${row.address}, ${row.town}`, inserted: true };
}

async function parseDetail(page) {
  return await page.evaluate(() => {
    const text = document.body.innerText;
    const result = { docNumber: null, consideration: null, streetNumber: null, streetName: null, grantors: [], grantees: [], rawText: '' };
    const docHeaderIdx = text.lastIndexOf('Doc. #');
    if (docHeaderIdx < 0) return result;
    const detailText = text.slice(docHeaderIdx);
    result.rawText = detailText;

    const docRowMatch = detailText.match(/Doc\. Status\s*\n?\s*(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d:.]+)\s+([A-Z][A-Z ]*)\s+(\d+)\s+([\d/]+)\s+([\d.]+)/);
    if (docRowMatch) {
      result.docNumber = docRowMatch[1];
      result.consideration = parseFloat(docRowMatch[7]) || 0;
    }

    const lines = detailText.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (/Street #/i.test(lines[i]) && /Street Name/i.test(lines[i])) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const dataLine = lines[j].trim();
          if (!dataLine) continue;
          const cells = dataLine.split(/\t+|\s{2,}/).map(c => c.trim()).filter(Boolean);
          if (cells.length >= 2 && /^\d/.test(cells[0])) {
            result.streetNumber = cells[0];
            result.streetName = cells[1];
            break;
          }
        }
        break;
      }
    }

    const ggMatch = detailText.match(/Grantor\/Grantee[\s\S]*?(?=References|$)/);
    if (ggMatch) {
      const ggLines = ggMatch[0].split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of ggLines) {
        const m = line.match(/^(.+?)\s+(Grantor|Grantee)$/);
        if (m) {
          if (m[2] === 'Grantor') result.grantors.push(m[1].trim());
          else result.grantees.push(m[1].trim());
        }
      }
    }
    return result;
  });
}

main().catch(err => { console.error(err); process.exit(1); });
