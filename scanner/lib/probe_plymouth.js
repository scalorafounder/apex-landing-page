// Recon: is Plymouth (titleview.org/plymouthdeeds) the same Avenu/20/20 platform as masslandrecords?
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const DEBUG = path.resolve('./debug-plymouth');
await mkdir(DEBUG, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

await page.goto('http://titleview.org/plymouthdeeds/', { waitUntil: 'networkidle', timeout: 30_000 });
await page.waitForTimeout(3000);
console.log(`URL: ${page.url()}`);
await page.screenshot({ path: path.join(DEBUG, '01_landing.png'), fullPage: true });

const text = await page.evaluate(() => document.body.innerText);
await writeFile(path.join(DEBUG, '01_landing.txt'), text);
console.log('\n=== LANDING PAGE (first 2500 chars) ===\n');
console.log(text.slice(0, 2500));

// Look for the same masslandrecords selectors
const masslandSearch = await page.$('#SearchCriteriaName1_DDL_SearchName').then(el => !!el).catch(() => false);
const titleViewSearch = await page.$('select[name*="SearchType"], select[name*="search"]').then(el => !!el).catch(() => false);
console.log(`\nHas masslandrecords-style dropdown: ${masslandSearch}`);
console.log(`Has any search dropdown: ${titleViewSearch}`);

// Find search-related links
const links = await page.$$eval('a', as =>
  as.filter(a => a.offsetParent !== null).slice(0, 30).map(a => ({
    text: (a.textContent || '').trim().slice(0, 60),
    href: a.href,
  })).filter(l => l.text)
);
console.log('\nVisible links:');
for (const l of links) console.log(`   "${l.text}" → ${l.href}`);

console.log('\n⏸️ Open 30s for inspection');
await page.waitForTimeout(30_000);
await browser.close();
