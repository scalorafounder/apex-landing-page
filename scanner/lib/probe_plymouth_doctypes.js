// List ALL doc types Plymouth offers in its dropdown
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

const docTypes = await page.$$eval('#SearchFormEx1_ACSDropDownList_DocumentType option', opts =>
  opts.map(o => o.text.trim()).filter(Boolean)
);
console.log(`Plymouth offers ${docTypes.length} doc types:`);
for (const t of docTypes) console.log(`   ${t}`);

const lienRelevant = docTypes.filter(t => /LIEN|TAKING|PENDENS|NOTICE|FORECLOS|TAX|JUDGMENT|ATTACHMENT/i.test(t));
console.log(`\n${lienRelevant.length} potentially relevant:`);
for (const t of lienRelevant) console.log(`   ${t}`);

await browser.close();
