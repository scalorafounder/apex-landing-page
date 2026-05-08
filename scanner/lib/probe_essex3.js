// Probe Essex's "Classic Search Our Records" + "Search Our Records" pages
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

const URLS = [
  'https://salemdeeds.com/SalemDeeds/Defaultsearch2.aspx',
  'https://salemdeeds.com/masearches',
];

for (const url of URLS) {
  console.log(`\n=== Trying ${url} ===`);
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForTimeout(3500);
    console.log(`   Status: ${resp?.status()} Final URL: ${page.url()}`);
    console.log(`   Title: ${await page.title()}`);

    // Check Avenu selectors
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
    console.log(`   Avenu selectors: ${JSON.stringify(sels)}`);

    // Get all links with text containing search/date/recorded
    const links = await page.$$eval('a, span, button', els =>
      els.filter(e => e.offsetParent !== null).map(e => ({
        tag: e.tagName,
        id: e.id,
        text: ((e.textContent || '') + '').trim().slice(0, 80),
        href: e.href || null,
      })).filter(l => l.text && /search|date|range|recorded|criteria|menu|book|name|land|advanced/i.test(l.text + l.id))
    );
    console.log(`   Search-related links (${links.length}):`);
    for (const l of links.slice(0, 20)) console.log(`      ${JSON.stringify(l)}`);

    const safe = url.replace(/[^a-z0-9]/gi, '_').slice(0, 60);
    await page.screenshot({ path: path.join(DEBUG, `${safe}.png`), fullPage: true });
  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
  }
}

console.log('\n⏸️  Holding 20s');
await page.waitForTimeout(20_000);
await browser.close();
