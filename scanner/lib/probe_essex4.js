// Essex South new platform = masearches (AIT_Search_Web_Application_CC, same as masslandrecords.com)
// Probe rec-date-search to confirm form structure matches
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
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
console.log(`URL: ${page.url()}`);
console.log(`Title: ${await page.title()}`);

const sels = await page.evaluate(() => ({
  // masslandrecords-style selectors
  fromDate: !!document.querySelector('input[name*="FromDate"], input[id*="FromDate"], input[placeholder*="rom"]'),
  toDate: !!document.querySelector('input[name*="ToDate"], input[id*="ToDate"], input[placeholder*="o Date"]'),
  searchBtn: !!document.querySelector('button[id*="Search"], input[id*="search"]'),

  // Visible inputs
  visibleInputs: [...document.querySelectorAll('input, select, button')].filter(e => e.offsetParent !== null).map(e => ({
    tag: e.tagName, type: e.type || null, id: e.id, name: e.name, placeholder: e.placeholder || null,
    value: (e.value || '').slice(0, 30),
    text: ((e.textContent || '') + '').trim().slice(0, 50),
  })),
}));
console.log('Form structure:');
console.log(JSON.stringify(sels, null, 2));

await page.screenshot({ path: path.join(DEBUG, 'rec_date_search.png'), fullPage: true });
console.log('\n⏸️  Holding 30s for inspection');
await page.waitForTimeout(30_000);
await browser.close();
