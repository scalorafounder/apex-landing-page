// Drill into Plymouth's titleview.org form to see if it's the same masslandrecords/Avenu structure.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const DEBUG = path.resolve('./debug-plymouth-form');
await mkdir(DEBUG, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

await page.goto('http://titleview.org/plymouthdeeds/', { waitUntil: 'networkidle', timeout: 30_000 });
await page.waitForTimeout(3000);
console.log(`URL: ${page.url()}`);
await page.screenshot({ path: path.join(DEBUG, '01_initial.png'), fullPage: true });

// Check selectors
const sels = await page.evaluate(() => {
  return {
    massSearchDropdown: !!document.querySelector('#SearchCriteriaName1_DDL_SearchName'),
    massOfficeDropdown: !!document.querySelector('#SearchCriteriaOffice1_DDL_OfficeName'),
    massCaseDropdown: !!document.querySelector('#SearchFormEx1_ACSDropDownList_DocumentType'),
    massDateInput: !!document.querySelector('#SearchFormEx1_DRACSTextBox_DateFrom'),
    allSelects: [...document.querySelectorAll('select')].filter(s => s.offsetParent).map(s => ({ id: s.id, name: s.name, optCount: s.options.length })),
  };
});
console.log('\nSelector check:');
console.log(JSON.stringify(sels, null, 2));

// If main page has nothing, check if there's a "click to enter" or similar
const links = await page.$$eval('a', as =>
  as.filter(a => a.offsetParent).slice(0, 10).map(a => ({
    text: (a.textContent || '').trim().slice(0, 40),
    href: a.href,
  }))
);
console.log('\nLinks:');
for (const l of links) console.log(`   "${l.text}" → ${l.href}`);

console.log('\n⏸️ Open 30s for inspection');
await page.waitForTimeout(30_000);
await browser.close();
