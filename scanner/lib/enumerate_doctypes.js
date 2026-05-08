// Enumerate the FULL document type dropdown for each registry on masslandrecords.
// Find what they call Lis Pendens, Tax Taking, etc. (registries name them differently)

import { chromium } from 'playwright';

const REGISTRIES = [
  { name: 'Suffolk',         url: 'http://www.masslandrecords.com/Suffolk' },
  { name: 'MiddlesexSouth',  url: 'http://www.masslandrecords.com/MiddlesexSouth' },
  { name: 'MiddlesexNorth',  url: 'http://www.masslandrecords.com/MiddlesexNorth' },
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
});

for (const r of REGISTRIES) {
  console.log(`\n========== ${r.name} ==========`);
  const page = await ctx.newPage();
  await page.goto(r.url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2000);

  const opts = await page.$$eval(
    '#SearchFormEx1_ACSDropDownList_DocumentType option',
    opts => opts.map(o => o.text.trim())
  );

  // Find ones related to our 3 signals
  console.log(`Total: ${opts.length}`);
  console.log(`\n🎯 Distress-relevant types:`);
  for (const opt of opts) {
    if (/tax|lien|notice|pendens|foreclos|takin|attach|order|complaint|judg|writ/i.test(opt)) {
      console.log(`   ${opt}`);
    }
  }
  await page.close();
}

await browser.close();
