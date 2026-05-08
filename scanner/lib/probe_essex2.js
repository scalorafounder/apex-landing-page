// Click "Searches" menu on salemdeeds.com and enumerate sub-options
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const DEBUG = path.resolve('./debug-essex');
await mkdir(DEBUG, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

await page.goto('https://salemdeeds.com/SalemDeeds/Default2.aspx', { waitUntil: 'domcontentloaded', timeout: 20_000 });
await page.waitForTimeout(2500);
console.log(`Initial URL: ${page.url()}`);

// Click Searches menu via the link
console.log('\n🖱️  Clicking Searches menu...');
const searchesLink = page.locator('a').filter({ hasText: /^Searches$/ }).first();
await searchesLink.click({ timeout: 8_000 }).catch(e => console.log(`   click err: ${e.message}`));
await page.waitForTimeout(3500);
console.log(`URL after: ${page.url()}`);

// Enumerate all visible clickables
const clickables = await page.$$eval('a, button, span, input[type="submit"]', els =>
  els.filter(e => e.offsetParent !== null).map(e => ({
    tag: e.tagName,
    id: e.id,
    text: ((e.textContent || e.value || '') + '').trim().slice(0, 80),
    href: e.href || null,
    onclick: (e.getAttribute('onclick') || '').slice(0, 200),
  })).filter(l => l.text)
);
console.log(`\n📋 ${clickables.length} clickables after Searches click:`);
for (const c of clickables) {
  if (/search|date|range|recorded|criteria|land|name|book|advanced|document/i.test(c.text + c.onclick + c.id)) {
    console.log(`   ${JSON.stringify(c)}`);
  }
}

await page.screenshot({ path: path.join(DEBUG, 'after_searches.png'), fullPage: true });

// Try to find Date Range link
console.log('\n🖱️  Trying Date Range...');
const dr = page.locator('a').filter({ hasText: /Date Range|Recorded Date/i }).first();
if (await dr.count()) {
  await dr.click({ timeout: 5_000 }).catch(e => console.log(`   click err: ${e.message}`));
  await page.waitForTimeout(3000);
  console.log(`   URL after Date Range: ${page.url()}`);

  const sels = await page.evaluate(() => ({
    dateFrom: !!document.querySelector('#SearchFormEx1_DRACSTextBox_DateFrom'),
    dateTo: !!document.querySelector('#SearchFormEx1_DRACSTextBox_DateTo'),
    btnAdvanced: !!document.querySelector('#SearchFormEx1_BtnAdvanced'),
    btnSearch: !!document.querySelector('#SearchFormEx1_btnSearch'),
    docType: !!document.querySelector('#SearchFormEx1_ACSDropDownList_DocumentType'),
    visibleSelects: [...document.querySelectorAll('select')].filter(s => s.offsetParent).map(s => ({
      id: s.id, name: s.name, optCount: s.options.length,
      sample: [...s.options].slice(0,5).map(o => o.text),
    })),
  }));
  console.log('Selectors:');
  console.log(JSON.stringify(sels, null, 2));
  await page.screenshot({ path: path.join(DEBUG, 'after_daterange.png'), fullPage: true });
}

console.log('\n⏸️  Holding 20s');
await page.waitForTimeout(20_000);
await browser.close();
