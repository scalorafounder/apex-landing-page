// What town abbreviation does Plymouth use for SCITUATE?
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
await page.selectOption('#SearchFormEx1_ACSDropDownList_Towns', { label: 'SCITUATE' });
await page.click('#SearchFormEx1_btnSearch');
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(5000);

// Dump first 5 rows
const rows = await page.$$eval('tr.DataGridRow, tr.DataGridAlternatingRow', trs =>
  trs.slice(0, 5).map(tr => {
    const cells = [...tr.querySelectorAll('td')].map(td => td.textContent?.trim() || '');
    return { cell10_townAbbrev: cells[10], cell9_address: cells[9], cell7_doctype: cells[7] };
  })
);
console.log(`First 5 rows from SCITUATE search:`);
for (const r of rows) console.log(`   ${JSON.stringify(r)}`);

// Try DUXBURY too
console.log('\n--- DUXBURY ---');
await page.goto('http://titleview.org/plymouthdeeds/', { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForTimeout(2500);
await page.locator('#Navigator1_SearchCriteria1_menuLabel').click();
await page.waitForTimeout(2000);
await page.locator('#Navigator1_SearchCriteria1_LinkButton03').click();
await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.click('#SearchFormEx1_BtnAdvanced');
await page.waitForTimeout(2000);
await page.fill('#SearchFormEx1_DRACSTextBox_DateFrom', '04/01/2026');
await page.fill('#SearchFormEx1_DRACSTextBox_DateTo', '05/07/2026');
await page.selectOption('#SearchFormEx1_ACSDropDownList_Towns', { label: 'DUXBURY' });
await page.click('#SearchFormEx1_btnSearch');
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(5000);

const dRows = await page.$$eval('tr.DataGridRow, tr.DataGridAlternatingRow', trs =>
  trs.slice(0, 5).map(tr => {
    const cells = [...tr.querySelectorAll('td')].map(td => td.textContent?.trim() || '');
    return { cell10_townAbbrev: cells[10], cell9_address: cells[9], cell7_doctype: cells[7] };
  })
);
console.log(`First 5 rows from DUXBURY search:`);
for (const r of dRows) console.log(`   ${JSON.stringify(r)}`);

await browser.close();
