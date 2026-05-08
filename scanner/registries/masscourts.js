// MA Trial Court (masscourts.org) scanner.
// Captures divorce filings (Probate & Family Court) and eviction filings (Housing Court).
// Single platform — covers ALL 50 of our target ZIPs.
//
// The site is gated by reCAPTCHA v2 image challenge. Uses 2Captcha to solve.
// One CAPTCHA solve per scanner run (cost: ~$0.0025 + 30-60s wait).
//
// Run:  node registries/masscourts.js                          (yesterday)
//       node registries/masscourts.js --debug                   (visible browser)
//       node registries/masscourts.js --days=7                  (last 7 days)
//       node registries/masscourts.js --only=eviction           (skip divorce)
//       node registries/masscourts.js --only=divorce            (skip eviction)

import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir, writeFile, appendFile } from 'fs/promises';
import path from 'path';
import { supabase, startScanRun, finishScanRun } from '../lib/supabase.js';
import { matchPropertyByAddress } from '../lib/address.js';
import { detectAndSolveRecaptcha } from '../lib/captcha.js';

const args = process.argv.slice(2);
const debug = args.includes('--debug');
const daysArg = args.find(a => a.startsWith('--days='));
const onlyArg = args.find(a => a.startsWith('--only='));
const daysBack = daysArg ? parseInt(daysArg.split('=')[1], 10) : parseInt(process.env.SCAN_DAYS_BACK || '1', 10);
const onlyType = onlyArg ? onlyArg.split('=')[1] : null;

const DEBUG_DIR = path.resolve('./debug-masscourts');

// ── What to scan ──────────────────────────────────────────────────────────

// Housing Court divisions covering our 50 ZIPs:
//   Eastern Housing Court → Suffolk + Middlesex + Norfolk + Essex
//   Southeast Housing Court → Plymouth (for Hingham, Scituate, Duxbury)
const HOUSING_DIVISIONS = [
  'Eastern Housing Court',
  'Southeast Housing Court',
];

// Probate divisions covering our 50 ZIPs:
//   Suffolk, Middlesex, Norfolk, Essex, Plymouth Counties
const PROBATE_DIVISIONS = [
  'Suffolk County Probate and Family Court',
  'Middlesex County Probate and Family Court',
  'Norfolk County Probate and Family Court',
  'Essex County Probate and Family Court',
  'Plymouth Probate and Family Court',
];

// Case-type dropdown values per court (discovered via recon).
// Housing Court → "Housing Court Summary Process" = eviction
// Probate → discovered at runtime — patterns matching divorce
const SCAN_TARGETS = [
  ...HOUSING_DIVISIONS.map(div => ({
    department: 'Housing Court',
    division: div,
    caseTypePatterns: [/summary\s*process/i],
    signalType: 'eviction',
    enabled: !onlyType || onlyType === 'eviction',
  })),
  ...PROBATE_DIVISIONS.map(div => ({
    department: 'Probate and Family Court',
    division: div,
    // MA Probate uses "Domestic Relations" (DR) for divorce filings + "Joint Petition" (JP)
    // for joint divorces. There's no "Complaint for Divorce" label in this dropdown.
    caseTypePatterns: [/^Domestic Relations$/i, /^Joint Petition$/i],
    signalType: 'divorce',
    enabled: !onlyType || onlyType === 'divorce',
  })),
].filter(t => t.enabled);

// Cities we care about (case-insensitive match against the cityCd dropdown).
// Court records use city names not ZIPs, so we can pre-filter.
const TARGET_CITIES = new Set([
  'boston', 'cambridge', 'somerville', 'medford', 'milton',
  'brookline', 'newton', 'watertown', 'waltham', 'lexington',
  'concord', 'sudbury', 'wayland', 'winchester', 'lincoln',
  'weston', 'carlisle', 'dover', 'westwood', 'wellesley',
  'needham', 'cohasset', 'hingham', 'scituate', 'duxbury',
  'marblehead', 'manchester',  // Manchester-by-the-Sea
  'chestnut hill',
]);

// ── Date helpers ──────────────────────────────────────────────────────────

const fmtMDY = d => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
const fmtMMDDYYYY = d => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
};

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(DEBUG_DIR, { recursive: true });

  const today = new Date();
  const dateFrom = new Date(today.getTime() - (daysBack - 1) * 24 * 60 * 60 * 1000);

  console.log(`\n🔍 Scanning masscourts.org`);
  console.log(`   Date range: ${fmtMDY(dateFrom)} → ${fmtMDY(today)}`);
  console.log(`   Targets:    ${SCAN_TARGETS.length} (${SCAN_TARGETS.map(t => t.signalType + '/' + t.division).join(', ')})`);
  console.log(`   Mode:       ${debug ? 'DEBUG (visible)' : 'production (headless)'}\n`);

  const scanRunId = await startScanRun('masscourts');
  let totalCases = 0;
  let signalsCreated = 0;

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !debug,
    args: !debug ? ['--disable-blink-features=AutomationControlled', '--no-sandbox'] : [],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await ctx.newPage();

  // Log all POST request bodies for debug
  if (debug) {
    page.on('request', req => {
      if (req.method() === 'POST' && req.url().includes('search.page')) {
        const body = req.postData();
        console.log(`   📡 POST ${req.url().slice(0, 100)}`);
        if (body) {
          // Show only fields with values
          const params = new URLSearchParams(body);
          for (const [k, v] of params) {
            if (v && v.trim()) console.log(`      ${k} = ${v.slice(0, 50)}`);
          }
        }
      }
    });
  }

  try {
    // ── Step 1: Solve CAPTCHA on home page (one-time per session) ──
    console.log('📂 Loading masscourts.org home...');
    await page.goto('https://www.masscourts.org/eservices/home.page', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(3000);

    console.log('🔐 Solving reCAPTCHA...');
    const solved = await detectAndSolveRecaptcha(page);
    if (!solved) console.log('   no captcha found — proceeding');
    await page.waitForTimeout(2000);

    // ── Step 2: Click "search public records" → search page ──
    console.log('🖱️  Navigating to search...');
    const searchLink = await page.waitForSelector(
      'a:has-text("search public records"), a:has-text("Click Here")',
      { timeout: 15_000 }
    );
    await searchLink.click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(3000);

    if (debug) await page.screenshot({ path: path.join(DEBUG_DIR, '01_search_landing.png'), fullPage: true });

    // ── Step 3: Run searches per (department, division, caseType) ──
    for (const target of SCAN_TARGETS) {
      console.log(`\n🏛️  ${target.signalType.toUpperCase()} · ${target.division}`);
      try {
        const result = await scanOneTarget(page, target, dateFrom, today);
        totalCases += result.cases;
        signalsCreated += result.signals;
        console.log(`   → ${result.cases} cases, ${result.signals} signals inserted`);
      } catch (err) {
        console.error(`   ❌ ${target.division}: ${err.message}`);
        await appendFile(path.join(DEBUG_DIR, 'errors.log'), `${new Date().toISOString()} ${target.division}: ${err.message}\n${err.stack}\n\n`);
      }
    }

    await finishScanRun(scanRunId, { documentsProcessed: totalCases, signalsCreated });
    console.log(`\n✅ Scan complete.`);
    console.log(`   Cases processed: ${totalCases}`);
    console.log(`   Signals created: ${signalsCreated}`);

  } catch (err) {
    console.error('\n❌ Fatal:', err);
    await finishScanRun(scanRunId, { documentsProcessed: totalCases, signalsCreated, errorMessage: err.message });
    if (debug) await page.screenshot({ path: path.join(DEBUG_DIR, 'fatal.png'), fullPage: true }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

// ── Scan one target (department + division + case-type pattern) ───────────

async function scanOneTarget(page, target, dateFrom, dateTo) {
  // After a previous target's submit we're on /searchresults.page — navigate
  // back to the search form. The "back to search" link is shown on results.
  if (page.url().includes('searchresults.page')) {
    const backLink = await page.locator('a:has-text("back to search")').first();
    if (await backLink.count()) {
      await backLink.click();
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  }

  // Pick department + division (sdeptCd, sdivCd)
  await page.selectOption('select[name="sdeptCd"]', { label: target.department });
  await page.waitForTimeout(2500);
  await page.selectOption('select[name="sdivCd"]', { label: target.division });
  await page.waitForTimeout(3000);

  if (debug) await page.screenshot({ path: path.join(DEBUG_DIR, `${target.signalType}_01_division.png`), fullPage: true });

  // Click the "Case Type" sub-tab — Wicket AJAX swaps the form section.
  // Wait for the AJAX response BEFORE trying to interact with the new form.
  const caseTypeAnchor = page.locator('a').filter({ has: page.locator('span', { hasText: /^Case Type$/ }) }).first();
  if (await caseTypeAnchor.count() === 0) {
    console.log(`   ⚠️ Case Type tab anchor not found`);
    return { cases: 0, signals: 0 };
  }
  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('search.page') && resp.status() === 200, { timeout: 10_000 }).catch(() => null),
    caseTypeAnchor.click(),
  ]);
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  if (debug) await page.screenshot({ path: path.join(DEBUG_DIR, `${target.signalType}_01b_after_tab.png`), fullPage: true });

  // Confirm tab activated
  const tabState = await page.evaluate(() => {
    const selected = document.querySelector('li.selected, li.active, .ui-state-active');
    return selected ? { tag: selected.tagName, text: selected.textContent?.trim().slice(0, 50) } : null;
  });
  console.log(`   selected tab: ${JSON.stringify(tabState)}`);

  // DEBUG: dump ALL form fields visible after the tab swap
  if (debug) {
    const fields = await page.evaluate(() => {
      const els = [...document.querySelectorAll('input, select, button')];
      return els
        .filter(e => e.name)
        .map(e => ({ tag: e.tagName, type: e.type, name: e.name, id: e.id, vis: e.offsetParent !== null }));
    });
    console.log(`   form fields after tab swap:`);
    for (const f of fields) console.log(`      ${JSON.stringify(f)}`);
  }

  // Find ALL caseCd dropdown options matching any of our patterns
  const matchedCaseTypes = await page.evaluate((patterns) => {
    const sel = document.querySelector('select[name="caseCd"]');
    if (!sel) return [];
    const opts = [...sel.options].map(o => o.text.trim());
    const matches = [];
    for (const opt of opts) {
      for (const p of patterns) {
        if (new RegExp(p, 'i').test(opt) && !matches.includes(opt)) {
          matches.push(opt);
        }
      }
    }
    return matches;
  }, target.caseTypePatterns.map(r => r.source));

  if (matchedCaseTypes.length === 0) {
    console.log(`   ⚠️ no matching case types (patterns: ${target.caseTypePatterns}) — skipping`);
    return { cases: 0, signals: 0 };
  }
  console.log(`   case types: ${matchedCaseTypes.map(t => `"${t}"`).join(', ')}`);
  // For tracking, use the first one (we still set all in the multi-select)
  const matchedCaseType = matchedCaseTypes[0];

  // CRITICAL ORDER: dates first, pageSize next, caseCd LAST.
  // Each AJAX response from Wicket re-renders the form section, which can
  // clear caseCd if we set it before other AJAX-triggering interactions.
  // Set everything that triggers AJAX BEFORE caseCd.

  // Date range — fires AJAX
  await page.fill('input[name="fileDateRange:dateInputBegin"]', fmtMMDDYYYY(dateFrom));
  await page.waitForTimeout(1000);
  await page.fill('input[name="fileDateRange:dateInputEnd"]', fmtMMDDYYYY(dateTo));
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // Page size — also AJAX
  await page.selectOption('select[name="pageSize"]', '75').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // NOW set caseCd LAST — no further interactions before submit
  // (Use multi-select if multiple case types match e.g. Domestic Relations + Joint Petition)
  await page.locator('select[name="caseCd"]').selectOption(
    matchedCaseTypes.map(label => ({ label }))
  );
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const verified = await page.$eval('select[name="caseCd"]',
    s => [...s.selectedOptions].map(o => o.text.trim()).join(', '));
  console.log(`   verified selection (just before submit): "${verified}"`);

  if (debug) await page.screenshot({ path: path.join(DEBUG_DIR, `${target.signalType}_02_form_filled.png`), fullPage: true });

  // Capture the POST request to see what's actually being submitted
  if (debug) {
    page.once('request', req => {
      if (req.method() === 'POST') {
        console.log(`   📡 POST ${req.url()}`);
        const body = req.postData();
        if (body) console.log(`   📡 body (first 1000 chars): ${body.slice(0, 1000)}`);
      }
    });
  }

  // The form structure has caseCd in a different form than submitLink.
  // Inject caseCd as a hidden input into the submit form before submitting.
  const beforeUrl = page.url();
  console.log(`   submitting (current URL: ${beforeUrl.slice(0, 80)}...)`);
  const submitInfo = await page.evaluate(() => {
    const submitBtn = document.querySelector('input[name="submitLink"]');
    const submitForm = submitBtn?.form;
    const caseCdSel = document.querySelector('select[name="caseCd"]');
    const caseCdValue = caseCdSel ? [...caseCdSel.selectedOptions].map(o => o.value).join(',') : null;

    if (!submitForm || !submitBtn) return { error: 'no submit form/button' };

    // If caseCd isn't in the submit form, inject it as a hidden input
    const caseCdInForm = submitForm.querySelector('select[name="caseCd"], input[name="caseCd"]');
    let injected = false;
    if (!caseCdInForm && caseCdValue) {
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'caseCd';
      hidden.value = caseCdValue;
      submitForm.appendChild(hidden);
      injected = true;
    }

    const formInputs = [...submitForm.elements].filter(e => e.name).map(e => e.name);
    submitBtn.click();
    return {
      ok: true,
      action: submitForm.action,
      formId: submitForm.id,
      caseCdValue,
      caseCdInForm: !!caseCdInForm,
      injected,
      formInputs,
    };
  });
  console.log(`   submitInfo: ${JSON.stringify(submitInfo)}`);

  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => null);
  await page.waitForTimeout(4000);
  const afterUrl = page.url();
  console.log(`   URL after submit: ${afterUrl.slice(0, 100)}`);

  if (debug) {
    await page.screenshot({ path: path.join(DEBUG_DIR, `${target.signalType}_03_results.png`), fullPage: true });
    const text = await page.evaluate(() => document.body.innerText);
    await writeFile(path.join(DEBUG_DIR, `${target.signalType}_03_results.txt`), text);
    const html = await page.content();
    await writeFile(path.join(DEBUG_DIR, `${target.signalType}_03_results.html`), html);
    console.log(`   results page text (first 1500 chars):`);
    console.log(`   ${text.slice(0, 1500).split('\n').join('\n   ')}`);
  }

  // Parse results
  const results = await extractResults(page);
  console.log(`   ${results.length} results on page 1`);

  if (debug && results.length > 0) {
    await writeFile(
      path.join(DEBUG_DIR, `${target.signalType}_results.json`),
      JSON.stringify(results.slice(0, 20), null, 2)
    );
  }

  let cases = 0;
  let signals = 0;
  for (const row of results) {
    cases++;
    try {
      const inserted = await processCase(page, row, target);
      if (inserted) signals++;
    } catch (err) {
      console.error(`   case ${row.caseNumber}: ${err.message}`);
    }
  }

  return { cases, signals };
}

// ── Extract case rows from results page ───────────────────────────────────

async function extractResults(page) {
  // Get raw rows (one per party). Then group by case_number to combine Plaintiff + Defendant.
  const rawRows = await page.evaluate(() => {
    const rows = [];
    const tables = document.querySelectorAll('table');
    for (const tbl of tables) {
      const trs = tbl.querySelectorAll('tr');
      for (const tr of trs) {
        const cells = [...tr.querySelectorAll('td')].map(c => c.textContent?.trim() || '');
        if (cells.length < 5) continue;
        // Find the case number — formats vary across courts:
        //   Housing Court: 26H84SP002424 (year + court code + type + seq + ends in digits)
        //   Probate: SU26D0766DR or MI26D1182JP (ends in case type letters)
        //   District Court: MICV2026000123
        // Universal pattern: 8+ alphanumeric uppercase chars with at least 4 digits inside
        const caseNumIdx = cells.findIndex(c => {
          const t = c.trim();
          if (!/^[0-9A-Z]{8,20}$/i.test(t)) return false;
          const digitCount = (t.match(/\d/g) || []).length;
          return digitCount >= 4;
        });
        if (caseNumIdx < 0) continue;
        // Find the file date
        const fileDate = cells.find(c => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c));
        rows.push({
          caseNumber: cells[caseNumIdx],
          partyName: cells[caseNumIdx - 1] || cells[0],  // name is just before case number
          caseType: cells[caseNumIdx + 1] || null,
          fileDate: fileDate || null,
          initiatingAction: cells[caseNumIdx + 3] || null,  // approx position
          partyType: cells.find(c => /^(Defendant|Plaintiff|Petitioner|Respondent|Trustee)$/i.test(c)) || null,
          status: cells.find(c => /^(Active|Closed|Reopened|Suspended)/i.test(c)) || null,
          court: cells.find(c => /Court$/i.test(c)) || null,
          allCells: cells,
        });
      }
    }
    return rows;
  });

  // Group by case_number — combine Plaintiff + Defendant into one logical case
  const cases = new Map();
  for (const r of rawRows) {
    const key = r.caseNumber;
    if (!cases.has(key)) {
      cases.set(key, {
        caseNumber: r.caseNumber,
        caseType: r.caseType,
        fileDate: r.fileDate,
        initiatingAction: r.initiatingAction,
        court: r.court,
        status: r.status,
        plaintiffs: [],
        defendants: [],
        otherParties: [],
      });
    }
    const c = cases.get(key);
    const partyType = (r.partyType || '').toLowerCase();
    if (partyType === 'plaintiff' || partyType === 'petitioner') {
      c.plaintiffs.push(r.partyName);
    } else if (partyType === 'defendant' || partyType === 'respondent') {
      c.defendants.push(r.partyName);
    } else {
      c.otherParties.push({ name: r.partyName, type: r.partyType });
    }
  }
  return [...cases.values()];
}

// ── Process one case: match by plaintiff (= property owner), insert signal ──

async function processCase(page, caseData, target) {
  const docId = `masscourts_${target.signalType}_${caseData.caseNumber}`;

  // Dedupe
  const { data: existing } = await supabase
    .from('signals')
    .select('id')
    .eq('source', 'masscourts')
    .eq('document_id', docId)
    .maybeSingle();
  if (existing) return false;

  // For evictions: Plaintiff is the landlord = property owner
  // For divorces: either party may own the property
  const ownerCandidates = target.signalType === 'eviction'
    ? caseData.plaintiffs
    : [...caseData.plaintiffs, ...caseData.defendants];

  let propertyId = null;
  let confidence = 0;
  let matchedAddress = null;
  let matchedOwner = null;

  for (const candidate of ownerCandidates) {
    if (!candidate || candidate.length < 4) continue;
    // Try to match against owner_name
    // First, try exact-ish matches (LLC names, business names)
    const cleanName = candidate.replace(/,?\s+(by|through|as|and\/or|d\/b\/a).+$/i, '').trim();
    const { data: byName } = await supabase
      .from('properties')
      .select('id, full_address, owner_name, assessed_total')
      .or(`owner_name.ilike.${cleanName.replace(/[%,]/g, ' ')}%,owner_name.ilike.%${cleanName.replace(/[%,]/g, ' ')}`)
      .limit(5);

    if (byName && byName.length > 0) {
      // Take the first match
      propertyId = byName[0].id;
      matchedAddress = byName[0].full_address;
      matchedOwner = byName[0].owner_name;
      confidence = byName.length === 1 ? 0.75 : 0.55;  // unique match is more confident
      break;
    }
  }

  // Also try parsing an address out of the LLC name (e.g. "5 Orlando St LLC" → 5 Orlando St)
  // STRICT: require both street number AND street name token to appear in the matched property's address.
  if (!propertyId) {
    for (const candidate of ownerCandidates) {
      const addrMatch = candidate?.match(/^(\d+)\s+([A-Za-z][\w\s]+?)(?:\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Boulevard|Blvd|Way|Highway|Hwy))\b/i);
      if (!addrMatch) continue;
      const [, num, streetName] = addrMatch;
      const cleanStreet = streetName.trim().toLowerCase();
      if (cleanStreet.length < 3) continue;

      // Strict ILIKE on properties — must match BOTH number + street name
      const { data: matches } = await supabase
        .from('properties')
        .select('id, full_address, owner_name, site_address')
        .ilike('full_address', `${num} %${cleanStreet}%`)
        .limit(5);
      if (matches && matches.length === 1) {
        propertyId = matches[0].id;
        matchedAddress = matches[0].full_address;
        confidence = 0.85;
        break;
      } else if (matches && matches.length > 1) {
        // Multiple matches — skip rather than guess wrong
        continue;
      }
    }
  }

  if (!propertyId) return false;

  // Filing date
  const fd = (caseData.fileDate || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const filingDate = fd ? `${fd[3]}-${fd[1].padStart(2, '0')}-${fd[2].padStart(2, '0')}` : null;

  const { error } = await supabase.from('signals').insert({
    property_id: propertyId,
    signal_type: target.signalType,
    source: 'masscourts',
    source_url: 'https://www.masscourts.org',
    document_id: docId,
    filing_date: filingDate,
    raw_text: `${caseData.caseType} | ${caseData.initiatingAction || ''} | Plaintiffs: ${caseData.plaintiffs.join(', ')} | Defendants: ${caseData.defendants.join(', ')}`.slice(0, 4000),
    parsed_data: {
      case_number: caseData.caseNumber,
      case_type: caseData.caseType,
      initiating_action: caseData.initiatingAction,
      plaintiffs: caseData.plaintiffs,
      defendants: caseData.defendants,
      court_division: target.division,
      matched_owner: matchedOwner,
      matched_address: matchedAddress,
    },
    match_confidence: confidence,
  });
  if (error) throw error;
  return true;
}

main().catch(err => { console.error(err); process.exit(1); });
