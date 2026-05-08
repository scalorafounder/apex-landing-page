// Reconnoiter MA Secretary of State business entity search.
// For LLC/Trust property owners, find the registered agent + managers.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const DEBUG = path.resolve('./debug-ma-sos');

async function main() {
  await mkdir(DEBUG, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  console.log('📂 Loading MA SOS business entity search...');
  await page.goto('https://corp.sec.state.ma.us/CorpWeb/CorpSearch/CorpSearch.aspx', {
    waitUntil: 'networkidle', timeout: 30_000,
  });
  await page.waitForTimeout(3000);
  console.log(`   URL: ${page.url()}`);
  await page.screenshot({ path: path.join(DEBUG, '01_search_form.png'), fullPage: true });

  // Inspect form
  const inputs = await page.$$eval('input,select,button', els =>
    els.filter(e => e.offsetParent !== null && e.type !== 'hidden').slice(0, 30).map(e => ({
      tag: e.tagName, id: e.id, name: e.name, type: e.type,
      value: e.value?.slice(0, 40), text: (e.textContent || '').trim().slice(0, 40),
    }))
  );
  console.log('\n📋 Visible form elements:');
  for (const i of inputs) console.log(`   ${i.tag} id="${i.id}" name="${i.name}" type="${i.type}" value="${i.value}" text="${i.text}"`);

  // Try searching for LMDE16 LLC
  console.log('\n🔍 Searching for "LMDE16 LLC"...');
  // Find text input — usually has placeholder or id like "txtEntityName"
  const nameInput = await page.$('#MainContent_txtEntityName, input[name*="EntityName"], input[name*="entityName"]');
  if (nameInput) {
    await nameInput.fill('LMDE16 LLC');
  } else {
    console.log('   ⚠️ no entity name input found');
  }
  await page.waitForTimeout(500);

  // Find search button
  const btn = await page.$('#MainContent_btnSearch, input[value*="Search"], button:has-text("Search")');
  if (btn) {
    await btn.click();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(3000);
    console.log(`   URL after search: ${page.url()}`);
    await page.screenshot({ path: path.join(DEBUG, '02_results.png'), fullPage: true });
    const text = await page.evaluate(() => document.body.innerText);
    await writeFile(path.join(DEBUG, '02_results.txt'), text);
    console.log('\n=== RESULTS PAGE ===\n');
    console.log(text.slice(0, 3000));
  } else {
    console.log('   ⚠️ no search button found');
  }

  // If results, click the first one to see detail page
  await page.waitForTimeout(2000);
  const firstResult = await page.$('a[id*="lnkEntityName"], a[onclick*="EntitySummary"], table a');
  if (firstResult) {
    console.log('\n🖱️  Clicking first result to see entity detail...');
    await firstResult.click();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(3000);
    console.log(`   URL: ${page.url()}`);
    await page.screenshot({ path: path.join(DEBUG, '03_detail.png'), fullPage: true });
    const detailText = await page.evaluate(() => document.body.innerText);
    await writeFile(path.join(DEBUG, '03_detail.txt'), detailText);
    console.log('\n=== ENTITY DETAIL PAGE ===\n');
    console.log(detailText.slice(0, 4000));
  }

  console.log('\n⏸️  Browser open 30s for inspection');
  await page.waitForTimeout(30_000);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
