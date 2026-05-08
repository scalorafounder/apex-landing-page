// Broad Plymouth search: 7 days, NO town filter, NO doc type filter
// Just verify the form returns ANY records
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

// Set a 7-day range (last week of 2026-05)
await page.fill('#SearchFormEx1_DRACSTextBox_DateFrom', '04/30/2026');
await page.fill('#SearchFormEx1_DRACSTextBox_DateTo', '05/07/2026');

// NO filters (broadest possible)
console.log('Submitting with no filters, 04/30 → 05/07...');
await page.click('#SearchFormEx1_btnSearch');
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(5000);

// Check result count
const rows = await page.$$eval('tr.DataGridRow', trs => trs.length);
console.log(`First page DataGridRow count: ${rows}`);

// Check for "No documents found" or pagination text
const text = await page.evaluate(() => document.body.innerText.slice(0, 2500));
console.log('\nResults page text (first 2500 chars):');
console.log(text);

await browser.close();
