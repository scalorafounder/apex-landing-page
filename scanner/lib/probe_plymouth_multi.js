// Plymouth: multi-town filter (HINGHAM + SCITUATE + DUXBURY), no doctype, 30 days
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

console.log('Selecting HINGHAM, SCITUATE, DUXBURY (multi)...');
await page.selectOption('#SearchFormEx1_ACSDropDownList_Towns', [
  { label: 'HINGHAM' },
  { label: 'SCITUATE' },
  { label: 'DUXBURY' },
]);
await page.waitForTimeout(500);

const sel = await page.$$eval('#SearchFormEx1_ACSDropDownList_Towns option:checked', opts =>
  opts.map(o => o.text.trim())
);
console.log(`Towns selected: [${sel.join(', ')}]`);

console.log('\nSubmitting (multi-town, no doctype)...');
await page.click('#SearchFormEx1_btnSearch');
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(5000);

const rows = await page.$$eval('tr.DataGridRow, tr.DataGridAlternatingRow', trs => trs.length);
console.log(`Result page rows: ${rows}`);

const limited = await page.evaluate(() => /limited to the first 1000/i.test(document.body.innerText));
console.log(`Hit 1000 limit: ${limited}`);

// Now try ADDING doctype filter
console.log('\n--- Now adding doctype filter (TAX LIEN + LIEN + NOTICE) ---');
// Hit back button or re-enter form
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
await page.selectOption('#SearchFormEx1_ACSDropDownList_Towns', [
  { label: 'HINGHAM' }, { label: 'SCITUATE' }, { label: 'DUXBURY' },
]);
await page.selectOption('#SearchFormEx1_ACSDropDownList_DocumentType', [
  { label: 'TAX LIEN' }, { label: 'LIEN' }, { label: 'NOTICE' },
]);

const selDocs = await page.$$eval('#SearchFormEx1_ACSDropDownList_DocumentType option:checked', opts =>
  opts.map(o => o.text.trim())
);
console.log(`Doc types selected: [${selDocs.join(', ')}]`);

await page.click('#SearchFormEx1_btnSearch');
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(5000);

const rows2 = await page.$$eval('tr.DataGridRow, tr.DataGridAlternatingRow', trs => trs.length);
console.log(`With doctype filter: ${rows2} rows`);

await browser.close();
