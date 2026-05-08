// Plymouth: single town filter (HINGHAM), no doctype, 30 days
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

await page.goto('http://titleview.org/plymouthdeeds/', { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForTimeout(3000);
await page.locator('#Navigator1_SearchCriteria1_menuLabel').click();
await page.waitForTimeout(2000);
await page.locator('#Navigator1_SearchCriteria1_LinkButton03').click();
await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
await page.waitForTimeout(3000);
await page.click('#SearchFormEx1_BtnAdvanced');
await page.waitForTimeout(2000);

await page.fill('#SearchFormEx1_DRACSTextBox_DateFrom', '04/01/2026');
await page.fill('#SearchFormEx1_DRACSTextBox_DateTo', '05/07/2026');

// Select HINGHAM only
console.log('Selecting HINGHAM only...');
await page.selectOption('#SearchFormEx1_ACSDropDownList_Towns', [{ label: 'HINGHAM' }]);
await page.waitForTimeout(1000);

// Verify selection took effect
const selected = await page.$$eval('#SearchFormEx1_ACSDropDownList_Towns option:checked', opts =>
  opts.map(o => o.text.trim())
);
console.log(`Towns selected per DOM: [${selected.join(', ')}]`);

console.log('\nSubmitting with HINGHAM only, 04/01 → 05/07, no doctype filter...');
await page.click('#SearchFormEx1_btnSearch');
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(5000);

const rows = await page.$$eval('tr.DataGridRow', trs => trs.length);
console.log(`First page DataGridRow count: ${rows}`);

const limitedNote = await page.evaluate(() => /limited to the first 1000/i.test(document.body.innerText));
console.log(`Hit 1000 record limit: ${limitedNote}`);

// Sample first 3 rows
const sampleRows = await page.$$eval('tr.DataGridRow', trs =>
  trs.slice(0, 3).map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent?.trim()).join(' | '))
);
console.log('\nFirst 3 rows:');
sampleRows.forEach(r => console.log(`   ${r}`));

await browser.close();
