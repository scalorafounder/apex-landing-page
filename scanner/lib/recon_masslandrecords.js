// Reconnaissance: open masslandrecords.com Suffolk page and dump everything
// we need to know to build the scraper — form structure, dropdown options,
// search workflow, result table format.
//
// Run: node lib/recon_masslandrecords.js
// Outputs findings to console + saves screenshots to ./recon-screenshots/

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const RECON_DIR = path.resolve('./recon-screenshots');
const REGISTRIES = [
  { name: 'Suffolk',         url: 'http://www.masslandrecords.com/Suffolk' },
  // Add others later once Suffolk works
];

async function recon(registry) {
  const browser = await chromium.launch({ headless: false }); // visible so we can watch
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  console.log(`\n📂 Loading ${registry.name}: ${registry.url}`);
  await page.goto(registry.url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: path.join(RECON_DIR, `${registry.name}_01_landing.png`), fullPage: true });
  console.log(`📸 saved landing screenshot`);

  // Find all tab links
  const tabs = await page.$$eval('a, button, [role="tab"]', els =>
    els
      .filter(el => /name|document|book|property|recorded\s*date|grantor|grantee/i.test(el.textContent || ''))
      .map(el => ({
        text: (el.textContent || '').trim().slice(0, 80),
        href: el.getAttribute('href'),
        onclick: el.getAttribute('onclick'),
        id: el.id,
        cls: el.className,
      }))
      .slice(0, 50)
  );
  console.log(`\n🔗 Tab/nav candidates:`);
  for (const t of tabs) {
    console.log(`   "${t.text}"  id="${t.id}"  onclick="${(t.onclick || '').slice(0, 60)}"`);
  }

  // Find document type dropdown(s)
  const selects = await page.$$eval('select', els =>
    els.map(el => ({
      id: el.id,
      name: el.name,
      visible: el.offsetParent !== null,
      options: Array.from(el.options).slice(0, 100).map(o => o.text.trim()),
    }))
  );
  console.log(`\n📋 Select dropdowns (${selects.length} total):`);
  for (const s of selects) {
    console.log(`   id="${s.id}" name="${s.name}" visible=${s.visible} (${s.options.length} options)`);
    if (s.options.length > 0 && s.options.length <= 30) {
      for (const o of s.options) console.log(`      - ${o}`);
    } else if (s.options.length > 30) {
      console.log(`      first 5: ${s.options.slice(0, 5).join(' | ')}`);
      console.log(`      last 5:  ${s.options.slice(-5).join(' | ')}`);
    }
  }

  // First — enumerate ALL 78 document types from the hidden dropdown
  // (it exists in the DOM even though the form section is hidden)
  console.log(`\n📋 ALL 78 document types (looking for TAX TAKING / NOTICE OF CONTRACT / LIS PENDENS):`);
  const allDocTypes = await page.$eval('#SearchFormEx1_ACSDropDownList_DocumentType', el =>
    Array.from(el.options).map(o => ({ value: o.value, text: o.text.trim() }))
  );
  for (const dt of allDocTypes) {
    const interesting = /tax|lien|notice|lis\s*pendens|contract|foreclos|taking|attach/i.test(dt.text);
    const marker = interesting ? '🎯' : '  ';
    console.log(`   ${marker} value="${dt.value.padEnd(8)}"  text="${dt.text}"`);
  }

  // Switch to Recorded Date Search and try clicking Advanced for hidden filters
  console.log(`\n🔀 Switching to Recorded Date Search mode...`);
  await page.selectOption('#SearchCriteriaName1_DDL_SearchName', { label: 'Recorded Date Search' });
  await page.waitForTimeout(3000);

  console.log(`🖱️  Clicking Advanced to reveal hidden filters...`);
  const advBtn = await page.$('#SearchFormEx1_BtnAdvanced');
  if (advBtn) {
    await advBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(RECON_DIR, `${registry.name}_03_recorded_date_advanced.png`), fullPage: true });
  }

  // Re-enumerate visible selects after Advanced
  const advSelects = await page.$$eval('select', els =>
    els.filter(el => el.offsetParent !== null).map(el => ({
      id: el.id, optionCount: el.options.length,
      sample: Array.from(el.options).slice(0, 5).map(o => o.text.trim()),
    }))
  );
  console.log(`\n📋 Visible selects after Advanced click:`);
  for (const s of advSelects) {
    console.log(`   id="${s.id}" (${s.optionCount} opts) sample: ${s.sample.join(', ')}`);
  }

  // Set a small date range and run a search to see what results look like
  console.log(`\n📅 Setting date range: yesterday → today and searching...`);
  // Clear and type new dates (M/D/YYYY format — site default)
  const dateFrom = await page.$('#SearchFormEx1_DRACSTextBox_DateFrom');
  if (dateFrom) {
    await dateFrom.fill('5/5/2026');
  }
  const dateTo = await page.$('#SearchFormEx1_DRACSTextBox_DateTo');
  if (dateTo) {
    await dateTo.fill('5/5/2026');
  }
  await page.waitForTimeout(500);
  // Multi-select doc types — pick ALL our target signal types in one search
  console.log(`   Selecting LIS PENDENS + TAX LIEN + INSTRUMENT OF TAKING + ORDER OF TAKING + LIEN + NOTICE...`);
  await page.selectOption('#SearchFormEx1_ACSDropDownList_DocumentType', [
    { label: 'LIS PENDENS' },
    { label: 'TAX LIEN' },
    { label: 'INSTRUMENT OF TAKING' },
    { label: 'ORDER OF TAKING' },
    { label: 'LIEN' },
    { label: 'NOTICE' },
  ]);
  await page.click('#SearchFormEx1_btnSearch');
  console.log(`   Submitted. Waiting for results...`);
  await page.waitForTimeout(8000);
  await page.screenshot({ path: path.join(RECON_DIR, `${registry.name}_04_results.png`), fullPage: true });

  // Inspect the results table
  const tables = await page.$$eval('table', els =>
    els.filter(el => el.rows && el.rows.length > 1).map(el => ({
      id: el.id,
      cls: el.className,
      rows: el.rows.length,
      headers: Array.from(el.rows[0]?.cells || []).map(c => (c.textContent || '').trim()),
      firstRow: Array.from(el.rows[1]?.cells || []).map(c => (c.textContent || '').trim().slice(0, 60)),
    }))
  );
  console.log(`\n📊 Tables on results page (${tables.length}):`);
  for (const t of tables) {
    console.log(`\n   id="${t.id}" cls="${t.cls}" rows=${t.rows}`);
    console.log(`   headers: ${JSON.stringify(t.headers)}`);
    console.log(`   row 1: ${JSON.stringify(t.firstRow)}`);
  }

  // Now enumerate visible form fields in Recorded Date mode
  const visibleSelects = await page.$$eval('select', els =>
    els.filter(el => el.offsetParent !== null).map(el => ({
      id: el.id,
      name: el.name,
      optionCount: el.options.length,
      sample: Array.from(el.options).slice(0, 5).map(o => o.text.trim()),
    }))
  );
  console.log(`\n📋 Visible selects in Recorded Date mode:`);
  for (const s of visibleSelects) {
    console.log(`   id="${s.id}" (${s.optionCount} opts) sample: ${s.sample.join(', ')}`);
  }

  const visibleInputs = await page.$$eval('input', els =>
    els.filter(el => el.offsetParent !== null && el.type !== 'hidden').slice(0, 30).map(el => ({
      id: el.id,
      name: el.name,
      type: el.type,
      placeholder: el.placeholder,
      value: el.value,
    }))
  );
  console.log(`\n📅 Visible inputs in Recorded Date mode:`);
  for (const i of visibleInputs) {
    console.log(`   id="${i.id}" type="${i.type}" placeholder="${i.placeholder}" value="${i.value}"`);
  }

  // Find search submit button
  const buttons = await page.$$eval('button, input[type="button"], input[type="submit"]', els =>
    els.filter(el => el.offsetParent !== null).map(el => ({
      id: el.id,
      text: (el.textContent || el.value || '').trim(),
      type: el.type,
    }))
  );
  console.log(`\n🔘 Visible buttons:`);
  for (const b of buttons) {
    console.log(`   id="${b.id}" type="${b.type}" text="${b.text}"`);
  }

  // Save full HTML for inspection
  const html = await page.content();
  await writeFile(path.join(RECON_DIR, `${registry.name}_full.html`), html);
  console.log(`\n💾 Saved full HTML to ${registry.name}_full.html`);

  console.log(`\n⏸️  Browser staying open 30s so you can inspect manually...`);
  await page.waitForTimeout(30_000);

  await browser.close();
}

async function main() {
  await mkdir(RECON_DIR, { recursive: true });
  for (const r of REGISTRIES) {
    await recon(r);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
