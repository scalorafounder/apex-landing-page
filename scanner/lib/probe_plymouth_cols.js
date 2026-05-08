// Dump Plymouth's column headers + cell layout
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

await page.fill('#SearchFormEx1_DRACSTextBox_DateFrom', '05/01/2026');
await page.fill('#SearchFormEx1_DRACSTextBox_DateTo', '05/07/2026');
await page.selectOption('#SearchFormEx1_ACSDropDownList_Towns', [{ label: 'HINGHAM' }]);
await page.click('#SearchFormEx1_btnSearch');
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(5000);

// Dump full table HTML structure
const tableInfo = await page.evaluate(() => {
  const dgr = document.querySelector('tr.DataGridRow');
  if (!dgr) return { error: 'no DataGridRow' };
  const table = dgr.closest('table');
  // All sibling rows including header
  const rows = [...table.querySelectorAll('tr')];
  return {
    tableId: table.id,
    tableClass: table.className,
    rowCount: rows.length,
    rowClasses: rows.slice(0, 5).map(r => r.className),
    headerRow: rows[0]
      ? [...rows[0].querySelectorAll('th, td')].map(c => c.textContent?.trim().slice(0, 30))
      : null,
    secondRow: rows[1]
      ? [...rows[1].querySelectorAll('th, td')].map(c => c.textContent?.trim().slice(0, 40))
      : null,
    firstDataRow: [...dgr.querySelectorAll('td')].map((td, i) => ({
      idx: i, text: td.textContent?.trim().slice(0, 50), hasInput: !!td.querySelector('input'),
      hasLink: !!td.querySelector('a'),
    })),
  };
});
console.log(JSON.stringify(tableInfo, null, 2));

await browser.close();
