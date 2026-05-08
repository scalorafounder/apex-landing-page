// Try to actually drive the Essex SPA: fill dates, type to filter town, submit, see what results look like
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const DEBUG = path.resolve('./debug-essex');
await mkdir(DEBUG, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

await page.goto('https://salemdeeds.com/MASEARCHES/rec-date-search', { waitUntil: 'domcontentloaded', timeout: 25_000 });
await page.waitForTimeout(4000);

// DevExtreme dx-date-box - dispatch native input/change events to bypass framework
async function typeDxDate(selector, mmddyyyy) {
  // Click first to focus the field
  const input = page.locator(selector).first();
  await input.click();
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');  // close calendar popup if it opened
  await page.waitForTimeout(200);

  // Select all and clear via keyboard
  await input.press('Control+A');
  await input.press('Delete');
  await page.waitForTimeout(150);

  // Type characters
  await page.keyboard.type(mmddyyyy, { delay: 80 });
  await page.waitForTimeout(300);

  // Tab away to trigger change/blur
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
}
await typeDxDate('dx-date-box[name="datefrom"] input.dx-texteditor-input', '02/07/2026');
const v1 = await page.locator('dx-date-box[name="datefrom"] input.dx-texteditor-input').inputValue();
console.log(`   From after type: "${v1}"`);

await typeDxDate('dx-date-box[name="dateto"] input.dx-texteditor-input', '05/07/2026');
const v2 = await page.locator('dx-date-box[name="dateto"] input.dx-texteditor-input').inputValue();
console.log(`   To after type: "${v2}"`);

// Verify the dates stuck
const dateValues = await page.evaluate(() => ({
  from: document.querySelector('dx-date-box[name="datefrom"] input.dx-texteditor-input')?.value,
  to: document.querySelector('dx-date-box[name="dateto"] input.dx-texteditor-input')?.value,
}));
console.log(`   Date inputs now: from=${dateValues.from} to=${dateValues.to}`);

// Type into Town filter (DevExtreme tag-box - find input inside it)
const townInput = page.locator('dx-tag-box, dx-select-box').filter({ has: page.locator('input[placeholder*="All Towns"]') }).locator('input').first();
const townFallback = page.locator('input[placeholder*="All Towns"]').first();
const townTarget = (await townInput.count()) ? townInput : townFallback;
await townTarget.click();
await townTarget.fill('MARBLEHEAD');
await page.waitForTimeout(1500);
// Look for dropdown options that appeared
const townOpts = await page.$$eval('li, [role="option"], div[class*="option"], div[class*="item"]', els =>
  els.filter(e => e.offsetParent && /marblehead/i.test(e.textContent || '')).map(e => ({
    tag: e.tagName, cls: e.className, text: (e.textContent || '').trim().slice(0, 60),
  }))
);
console.log(`   Town dropdown options matching "MARBLEHEAD": ${townOpts.length}`);
for (const o of townOpts) console.log(`      ${JSON.stringify(o)}`);

// Click first option that says MARBLEHEAD - DevExtreme list items
const townOptLoc = page.locator('div.dx-item.dx-list-item').filter({ hasText: /^MARBLEHEAD$/i }).first();
if (await townOptLoc.count()) {
  await townOptLoc.click({ timeout: 5_000 }).catch(e => console.log(`   town click err: ${e.message}`));
  console.log('   ✓ Selected MARBLEHEAD');
  await page.waitForTimeout(1000);
}

// Type into Doc Type filter — try LIS PENDENS
const docInput = page.locator('input[placeholder*="All Doc Types"]').first();
await docInput.click();
await docInput.fill('LIS');
await page.waitForTimeout(1500);
const docOpts = await page.$$eval('li, [role="option"], div[class*="option"], div[class*="item"]', els =>
  els.filter(e => e.offsetParent && /lis|pendens/i.test(e.textContent || '')).map(e => ({
    tag: e.tagName, cls: e.className, text: (e.textContent || '').trim().slice(0, 60),
  }))
);
console.log(`   Doc dropdown options matching "LIS": ${docOpts.length}`);
for (const o of docOpts.slice(0, 10)) console.log(`      ${JSON.stringify(o)}`);

// Click LIS PENDENS option
const docOptLoc = page.locator('div.dx-item.dx-list-item').filter({ hasText: /^LIS PENDENS$/i }).first();
if (await docOptLoc.count()) {
  await docOptLoc.click({ timeout: 5_000 }).catch(e => console.log(`   doc click err: ${e.message}`));
  console.log('   ✓ Selected LIS PENDENS');
  await page.waitForTimeout(1000);
}

// Hit SEARCH - the form's submit button
console.log('\n🖱️  Clicking SEARCH...');
await page.locator('button').filter({ hasText: /^\s*SEARCH\s*$/i }).first().click({ timeout: 8_000 }).catch(e => console.log(`   search click err: ${e.message}`));

// Wait for loading to finish
console.log('   Waiting for results to load...');
await page.waitForTimeout(4000);
// Wait for "Loading..." text to disappear
for (let i = 0; i < 30; i++) {
  const stillLoading = await page.evaluate(() => /Loading\.\.\./i.test(document.body.innerText));
  if (!stillLoading) break;
  await page.waitForTimeout(2000);
}
await page.waitForTimeout(2000);
console.log(`   URL after: ${page.url()}`);
console.log(`   Title: ${await page.title()}`);

await page.screenshot({ path: path.join(DEBUG, 'after_search.png'), fullPage: true });

// What does the result page look like?
const result = await page.evaluate(() => {
  const dxRows = [...document.querySelectorAll('tr.dx-row, tr.dx-data-row')].filter(r => r.offsetParent);
  const allRows = [...document.querySelectorAll('tr')].filter(r => r.offsetParent);
  return {
    dxDataRows: dxRows.length,
    allTrs: allRows.length,
    headerText: document.querySelector('.search-result-header, h2, h3')?.textContent?.trim() || null,
    sampleDxRow: dxRows[0] ? (dxRows[0].textContent || '').trim().slice(0, 400) : null,
    bodyTextSnippet: document.body.innerText.slice(0, 2500),
  };
});
console.log('\n📊 Result page:');
console.log(JSON.stringify(result, null, 2));

await writeFile(path.join(DEBUG, 'result.txt'), await page.evaluate(() => document.body.innerText));

console.log('\n⏸️  Holding 60s for inspection');
await page.waitForTimeout(60_000);
await browser.close();
