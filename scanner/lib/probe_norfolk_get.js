// Quick test: can we hit Norfolk ALIS with a GET URL constructed manually?
// If yes, we skip the form-fill complexity entirely.
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const DEBUG = path.resolve('./debug-norfolk-get');
await mkdir(DEBUG, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

// First load the search form to establish session/cookies
console.log('📂 Loading ALIS search form to establish session...');
await page.goto('https://www.norfolkresearch.org/ALIS/WW400R.HTM?WSIQTP=LR09D&WSKYCD=E', {
  waitUntil: 'networkidle', timeout: 30_000,
});
await page.waitForTimeout(2000);

// Now try with date params + search
const searchUrl = 'https://www.norfolkresearch.org/ALIS/WW400R.HTM?WSIQTP=LR09D&WSKYCD=E&W9FDTA=04302026&W9TDTA=05072026&W9TOWN=&W9ABR=';
console.log(`\n🔎 Navigating to search URL with date params...`);
console.log(`   ${searchUrl}`);
await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30_000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(DEBUG, '01_after_get.png'), fullPage: true });

const text = await page.evaluate(() => document.body.innerText);
await writeFile(path.join(DEBUG, '01_after_get.txt'), text);
console.log(`\n=== AFTER GET URL (first 4000 chars) ===\n`);
console.log(text.slice(0, 4000));
console.log('---');

// Try clicking Search Records button if we're back on a form
const searchBtn = await page.$('input[value="Search Records"]');
if (searchBtn) {
  console.log('\n🖱️  Found "Search Records" button — clicking it...');
  await page.fill('input[name="W9FDTA"]', '04302026');
  await page.fill('input[name="W9TDTA"]', '05072026');
  await searchBtn.click();
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log(`   URL after click: ${page.url()}`);
  await page.screenshot({ path: path.join(DEBUG, '02_after_click.png'), fullPage: true });
  const t = await page.evaluate(() => document.body.innerText);
  await writeFile(path.join(DEBUG, '02_after_click.txt'), t);
  console.log(`\n=== AFTER SEARCH CLICK (first 4000 chars) ===\n`);
  console.log(t.slice(0, 4000));
}

console.log('\n⏸️  Browser open 30s for inspection');
await page.waitForTimeout(30_000);
await browser.close();
