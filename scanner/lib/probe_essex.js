// Probe salemdeeds.com (Essex South) to find search form entry
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const DEBUG = path.resolve('./debug-essex');
await mkdir(DEBUG, { recursive: true });

const URLS_TO_TRY = [
  'https://salemdeeds.com/SalemDeeds/Default2.aspx',
  'https://salemdeeds.com/salemdeeds/',
  'https://salemdeeds.com/',
  'https://salemdeeds.com/salemdeeds/Default.aspx',
];

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

for (const url of URLS_TO_TRY) {
  console.log(`\n=== Trying ${url} ===`);
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(3000);
    console.log(`   Status: ${resp?.status()} Final URL: ${page.url()}`);
    const title = await page.title();
    console.log(`   Title: ${title}`);

    // Look for "Search Criteria" menu/button or any "Search" links
    const links = await page.$$eval('a, button, span, input[type="submit"]', els =>
      els.filter(e => e.offsetParent !== null).map(e => ({
        tag: e.tagName,
        id: e.id,
        text: ((e.textContent || e.value || '') + '').trim().slice(0, 80),
        href: e.href || null,
      })).filter(l => l.text && /search|date|range|recorded|criteria|land|menu/i.test(l.text))
    );
    console.log(`   Search-related elements (${links.length}):`);
    for (const l of links.slice(0, 30)) console.log(`      ${JSON.stringify(l)}`);

    // Check well-known selectors
    const sels = await page.evaluate(() => ({
      menuLabel: !!document.querySelector('#Navigator1_SearchCriteria1_menuLabel'),
      lb01: !!document.querySelector('#Navigator1_SearchCriteria1_LinkButton01'),
      lb02: !!document.querySelector('#Navigator1_SearchCriteria1_LinkButton02'),
      lb03: !!document.querySelector('#Navigator1_SearchCriteria1_LinkButton03'),
      lb04: !!document.querySelector('#Navigator1_SearchCriteria1_LinkButton04'),
      dateFrom: !!document.querySelector('#SearchFormEx1_DRACSTextBox_DateFrom'),
      btnAdvanced: !!document.querySelector('#SearchFormEx1_BtnAdvanced'),
      btnSearch: !!document.querySelector('#SearchFormEx1_btnSearch'),
    }));
    console.log(`   Selectors: ${JSON.stringify(sels)}`);

    const safeName = url.replace(/[^a-z0-9]/gi, '_').slice(0, 60);
    await page.screenshot({ path: path.join(DEBUG, `${safeName}.png`), fullPage: true });
  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
  }
}

console.log('\n⏸️  Holding 20s for inspection');
await page.waitForTimeout(20_000);
await browser.close();
