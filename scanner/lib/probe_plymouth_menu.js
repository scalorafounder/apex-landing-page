// Find the actual search form on Plymouth titleview.org by clicking the Search Criteria menu
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const DEBUG = path.resolve('./debug-plymouth-menu');
await mkdir(DEBUG, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

await page.goto('http://titleview.org/plymouthdeeds/', { waitUntil: 'networkidle', timeout: 30_000 });
await page.waitForTimeout(3000);
console.log(`URL: ${page.url()}`);

// Look for "Search Criteria" menu/button
console.log('\n🔍 Looking for "Search Criteria" menu...');
const menuTriggers = await page.$$eval('a, button, span', els =>
  els.filter(e => e.offsetParent && /search criteria/i.test(e.textContent || '')).map(e => ({
    tag: e.tagName, id: e.id, text: e.textContent?.trim().slice(0, 60), href: e.href || null,
    onclick: e.getAttribute('onclick'),
  }))
);
console.log(`   Found ${menuTriggers.length} candidates:`);
for (const t of menuTriggers) console.log(`      ${JSON.stringify(t)}`);

// Try clicking it
if (menuTriggers.length > 0) {
  const trigger = page.locator('a, button, span').filter({ hasText: /Search Criteria/i }).first();
  console.log('\n🖱️  Clicking Search Criteria menu...');
  await trigger.click({ timeout: 5_000 }).catch(e => console.log(`   click failed: ${e.message}`));
  await page.waitForTimeout(3000);
  console.log(`   URL after click: ${page.url()}`);
  await page.screenshot({ path: path.join(DEBUG, '01_after_menu.png'), fullPage: true });

  // Re-check selectors
  const sels = await page.evaluate(() => {
    return {
      hasSearchTypeDropdown: !!document.querySelector('#SearchCriteriaName1_DDL_SearchName'),
      hasOfficeDropdown: !!document.querySelector('#SearchCriteriaOffice1_DDL_OfficeName'),
      hasDocTypeDropdown: !!document.querySelector('#SearchFormEx1_ACSDropDownList_DocumentType'),
      hasDateInput: !!document.querySelector('#SearchFormEx1_DRACSTextBox_DateFrom'),
      visibleSelects: [...document.querySelectorAll('select')].filter(s => s.offsetParent).map(s => ({
        id: s.id, name: s.name, optCount: s.options.length,
      })),
    };
  });
  console.log('\nSelectors after menu click:');
  console.log(JSON.stringify(sels, null, 2));
}

console.log('\n⏸️ Open 30s for inspection');
await page.waitForTimeout(30_000);
await browser.close();
