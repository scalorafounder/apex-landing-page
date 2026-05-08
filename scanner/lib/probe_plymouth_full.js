// Final attempt: find Plymouth's Recorded Date / Date Range search by enumerating EVERY clickable
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const DEBUG = path.resolve('./debug-plymouth-full');
await mkdir(DEBUG, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

await page.goto('http://titleview.org/plymouthdeeds/', { waitUntil: 'networkidle', timeout: 30_000 });
await page.waitForTimeout(3000);
console.log(`Initial URL: ${page.url()}`);

// Click Search Criteria menu (we know this works)
const menuBtn = page.locator('a').filter({ hasText: /^Search Criteria$/ }).first();
await menuBtn.click();
await page.waitForTimeout(2500);

// Now enumerate EVERY clickable element with text
const allClickables = await page.$$eval('a, button, input[type="button"], input[type="submit"]', els =>
  els.filter(e => e.offsetParent !== null).map(e => ({
    tag: e.tagName,
    text: (e.textContent || e.value || '').trim().slice(0, 80),
    href: e.href || null,
    onclick: (e.getAttribute('onclick') || '').slice(0, 150),
    id: e.id,
  })).filter(c => c.text)
);

console.log(`\n📋 ALL ${allClickables.length} clickables after menu click:`);
for (const c of allClickables) {
  if (/recorded|date|range|name|book|property|document|search|land/i.test(c.text + c.onclick)) {
    console.log(`   ${JSON.stringify(c)}`);
  }
}

// Also click any "Recorded Land" link
console.log('\n🖱️  Trying to click Recorded Land...');
const rlLink = page.locator('a').filter({ hasText: /^Recorded Land$/ }).first();
if (await rlLink.count()) {
  await rlLink.click({ timeout: 5_000 }).catch(e => console.log(`   ${e.message}`));
  await page.waitForTimeout(2500);
  console.log(`   URL after: ${page.url()}`);
}

// Try Date Range link
console.log('\n🖱️  Trying Date Range...');
const drLink = page.locator('a').filter({ hasText: /Date Range|Recorded Date/i }).first();
if (await drLink.count()) {
  await drLink.click({ timeout: 5_000 }).catch(e => console.log(`   ${e.message}`));
  await page.waitForTimeout(2500);
}

// Final selector check
const fields = await page.evaluate(() => ({
  searchType: !!document.querySelector('#SearchCriteriaName1_DDL_SearchName'),
  office: !!document.querySelector('#SearchCriteriaOffice1_DDL_OfficeName'),
  dateFrom: !!document.querySelector('#SearchFormEx1_DRACSTextBox_DateFrom'),
  dateTo: !!document.querySelector('#SearchFormEx1_DRACSTextBox_DateTo'),
  docType: !!document.querySelector('#SearchFormEx1_ACSDropDownList_DocumentType'),
  search: !!document.querySelector('#SearchFormEx1_btnSearch'),
}));
console.log(`\nFinal selector check:`);
console.log(JSON.stringify(fields, null, 2));

await page.screenshot({ path: path.join(DEBUG, 'final.png'), fullPage: true });
const text = await page.evaluate(() => document.body.innerText);
await writeFile(path.join(DEBUG, 'final.txt'), text);

console.log('\n⏸️ Open 30s for manual verification');
await page.waitForTimeout(30_000);
await browser.close();
