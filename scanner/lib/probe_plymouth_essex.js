// Find the actual search form URL for Plymouth + Essex South.
// Both are Avenu installations but probably need menu/click navigation first.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const DEBUG = path.resolve('./debug-plymouth-essex');
await mkdir(DEBUG, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
});

async function probe(label, url) {
  const page = await ctx.newPage();
  console.log(`\n=== ${label}: ${url} ===`);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (e) {
    console.log(`   ❌ load failed: ${e.message}`);
    await page.close();
    return;
  }
  await page.waitForTimeout(3000);
  console.log(`   final URL: ${page.url()}`);

  // Click any "Click here to enter / Continue" / Search Criteria buttons
  const enterBtns = await page.locator('a, button, input').filter({ hasText: /click here|enter|continue|search criteria|recorded land|begin/i }).all();
  if (enterBtns.length > 0) {
    console.log(`   found ${enterBtns.length} possible entry buttons`);
    for (let i = 0; i < Math.min(enterBtns.length, 5); i++) {
      const text = await enterBtns[i].innerText().catch(() => '');
      console.log(`      [${i}] "${text.slice(0, 50)}"`);
    }
    // Try clicking the first one
    try {
      await enterBtns[0].click({ timeout: 5_000 });
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(2500);
      console.log(`   URL after click: ${page.url()}`);
    } catch (e) {
      console.log(`   click failed: ${e.message}`);
    }
  }

  // Check if search dropdown now exists
  const searchDropdown = await page.$('#SearchCriteriaName1_DDL_SearchName').then(el => !!el).catch(() => false);
  console.log(`   masslandrecords-style search dropdown: ${searchDropdown}`);

  // Get all visible selects
  const selects = await page.$$eval('select', els =>
    els.filter(e => e.offsetParent).map(e => ({
      id: e.id, name: e.name, optCount: e.options.length,
    }))
  );
  console.log(`   visible selects: ${JSON.stringify(selects)}`);

  await page.screenshot({ path: path.join(DEBUG, `${label.toLowerCase()}.png`), fullPage: true });
  const text = await page.evaluate(() => document.body.innerText);
  await writeFile(path.join(DEBUG, `${label.toLowerCase()}.txt`), text);

  await page.close();
}

await probe('plymouth', 'http://titleview.org/plymouthdeeds/');
await probe('plymouth_search', 'http://search.plymouthdeeds.com/');
await probe('essex_salemdeeds', 'http://www.salemdeeds.com/');
await probe('essex_records', 'http://www.salemdeeds.com/salemdeeds/Default.aspx');

await browser.close();
