// Quick probe: does masslandrecords.com/Norfolk actually work?
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const DEBUG = path.resolve('./debug-norfolk-probe');

async function tryUrl(url) {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  console.log(`\n📂 Trying ${url}...`);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (e) {
    console.log(`   ❌ navigation failed: ${e.message}`);
    await browser.close();
    return null;
  }
  await page.waitForTimeout(3000);
  const finalUrl = page.url();
  const title = await page.title();
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
  console.log(`   Final URL: ${finalUrl}`);
  console.log(`   Title: ${title}`);
  console.log(`   Body preview: ${bodyText}`);
  await page.screenshot({ path: path.join(DEBUG, `${url.split('/').pop() || 'root'}.png`), fullPage: true });

  // Check for the masslandrecords search dropdown
  const dropdownExists = await page.$('#SearchCriteriaName1_DDL_SearchName').then(el => !!el);
  console.log(`   masslandrecords search dropdown present: ${dropdownExists}`);

  await browser.close();
  return { finalUrl, title, dropdownExists };
}

async function exploreAlis() {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  await page.goto('https://www.norfolkresearch.org/ALIS/WW400R.HTM', { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(3000);

  console.log('\n=== ALIS HOMEPAGE — all visible links ===');
  const links = await page.$$eval('a', as =>
    as.filter(a => a.offsetParent !== null).map(a => ({
      text: (a.textContent || '').trim().slice(0, 80),
      href: a.href,
      onclick: a.getAttribute('onclick'),
    }))
  );
  for (const l of links) {
    if (l.text) console.log(`   "${l.text}"  →  ${l.href}`);
  }

  // Try Search by Address
  console.log('\n🖱️  Looking for Address search...');
  const addrLink = await page.$('a:has-text("Address")');
  if (addrLink) {
    await addrLink.click();
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(3000);
    console.log(`   URL: ${page.url()}`);
    await page.screenshot({ path: path.join(DEBUG, 'alis_address_search.png'), fullPage: true });
    const text = await page.evaluate(() => document.body.innerText);
    console.log(`\n=== ADDRESS SEARCH PAGE ===\n${text.slice(0, 2500)}`);
    // Go back so we can also explore registry records
    await page.goto('https://www.norfolkresearch.org/ALIS/WW400R.HTM', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
  }

  console.log('\n🖱️  Clicking "Search Registry Records"...');
  const reg = await page.$('a:has-text("Search Registry Records")');
  if (reg) {
    await reg.click();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);
    console.log(`   URL after click: ${page.url()}`);
    await page.screenshot({ path: path.join(DEBUG, 'alis_registry_records.png'), fullPage: true });
    const html = await page.content();
    await writeFile(path.join(DEBUG, 'alis_registry_records.html'), html);
    const text = await page.evaluate(() => document.body.innerText);
    console.log(`\n=== REGISTRY RECORDS PAGE TEXT ===\n${text.slice(0, 3000)}`);

    // Enumerate forms and selects
    const selects = await page.$$eval('select', els =>
      els.filter(el => el.offsetParent !== null).map(el => ({
        id: el.id, name: el.name,
        options: Array.from(el.options).map(o => o.text.trim()),
      }))
    );
    console.log(`\n📋 Selects on this page (${selects.length}):`);
    for (const s of selects) {
      console.log(`   id="${s.id}" name="${s.name}" (${s.options.length} opts)`);
      if (s.options.length <= 30) for (const o of s.options) console.log(`      - ${o}`);
    }

    const inputs = await page.$$eval('input', els =>
      els.filter(el => el.offsetParent !== null && el.type !== 'hidden').map(el => ({
        id: el.id, name: el.name, type: el.type, value: el.value, placeholder: el.placeholder,
      }))
    );
    console.log(`\n📝 Inputs:`);
    for (const i of inputs) console.log(`   ${JSON.stringify(i)}`);

    // Enumerate W9ABR options (the 119-option dropdown — likely doc types)
    const abrOpts = await page.$$eval('#W9ABR option', opts => opts.map(o => ({ value: o.value, text: o.text.trim() })));
    console.log(`\n🎯 W9ABR options (likely doc type filter) — searching for tax/lien/notice/lis pendens:`);
    for (const o of abrOpts) {
      const interesting = /tax|lien|notice|lis\s*pendens|contract|foreclos|taking|attach/i.test(o.text);
      if (interesting) console.log(`   🎯 value="${o.value}" text="${o.text}"`);
    }

    // Try the "Entry Date" search mode found in the sub-menu
    console.log('\n🖱️  Clicking "Entry Date" to find date-range search...');
    const entryDate = await page.$('a:has-text("Entry Date")');
    if (entryDate) {
      await entryDate.click();
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(3000);
      console.log(`   URL: ${page.url()}`);
      await page.screenshot({ path: path.join(DEBUG, 'alis_entry_date.png'), fullPage: true });
      const text = await page.evaluate(() => document.body.innerText);
      console.log(`\n=== ENTRY DATE SEARCH PAGE ===\n${text.slice(0, 3000)}`);

      const selects = await page.$$eval('select', els =>
        els.filter(el => el.offsetParent !== null).map(el => ({
          id: el.id, name: el.name, optCount: el.options.length,
          sample: Array.from(el.options).slice(0, 5).map(o => o.text.trim()),
        }))
      );
      console.log(`\n📋 Selects on Entry Date page:`);
      for (const s of selects) {
        console.log(`   id="${s.id}" name="${s.name}" (${s.optCount} opts) sample: ${s.sample.join(', ')}`);
      }

      const inputs = await page.$$eval('input', els =>
        els.filter(el => el.offsetParent !== null && el.type !== 'hidden').map(el => ({
          id: el.id, name: el.name, type: el.type, placeholder: el.placeholder,
        }))
      );
      console.log(`\n📝 Inputs on Entry Date page:`);
      for (const i of inputs) console.log(`   ${JSON.stringify(i)}`);

      // Try submitting with date range + town
      console.log('\n🧪 Submitting Entry Date search: 4/30 → 5/6, town = Wellesley...');
      // Discover field names — they're probably similar (W9FDTA/W9TDTA pattern)
      const tryDateFrom = inputs.find(i => /from|start|fda|fdt/i.test(i.name + i.id));
      const tryDateTo   = inputs.find(i => /to|end|tda|tdt/i.test(i.name + i.id));
      const tryTown     = selects.find(s => /town/i.test(s.name + s.id));
      console.log(`   inferred fields: from=${tryDateFrom?.name}, to=${tryDateTo?.name}, town=${tryTown?.name}`);
      if (tryDateFrom) await page.fill(`input[name="${tryDateFrom.name}"]`, '04302026');
      if (tryDateTo) await page.fill(`input[name="${tryDateTo.name}"]`, '05062026');
      if (tryTown) {
        try { await page.selectOption(`select[name="${tryTown.name}"]`, { label: 'Wellesley' }); }
        catch (e) { console.log(`   town select failed: ${e.message}`); }
      }
      await page.click('input[type="submit"]');
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(3000);
      console.log(`   URL after submit: ${page.url()}`);
      await page.screenshot({ path: path.join(DEBUG, 'alis_entry_date_results.png'), fullPage: true });
      const resultText = await page.evaluate(() => document.body.innerText);
      console.log(`\n=== ENTRY DATE RESULTS ===\n${resultText.slice(0, 3000)}`);
    } else {
      console.log('   ❌ Entry Date link not found');
    }
  }

  console.log('\n⏸️  Browser open 30s for inspection');
  await page.waitForTimeout(30_000);
  await browser.close();
}

async function main() {
  await mkdir(DEBUG, { recursive: true });
  await exploreAlis();
}

main().catch(e => { console.error(e); process.exit(1); });
