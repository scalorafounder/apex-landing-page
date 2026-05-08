// Find what case-type labels Probate Court uses (for divorce)
import { chromium } from 'playwright';
import { detectAndSolveRecaptcha } from './captcha.js';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

await page.goto('https://www.masscourts.org/eservices/home.page', { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForTimeout(3000);
await detectAndSolveRecaptcha(page);
await page.waitForTimeout(2000);
await page.click('a:has-text("search public records"), a:has-text("Click Here")');
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(3000);

await page.selectOption('select[name="sdeptCd"]', { label: 'Probate and Family Court' });
await page.waitForTimeout(2500);
await page.selectOption('select[name="sdivCd"]', { label: 'Middlesex County Probate and Family Court' });
await page.waitForTimeout(3500);

const caseTypeAnchor = page.locator('a').filter({ has: page.locator('span', { hasText: /^Case Type$/ }) }).first();
await caseTypeAnchor.click();
await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
await page.waitForTimeout(2500);

const caseTypes = await page.$$eval('select[name="caseCd"] option', opts =>
  opts.map(o => ({ value: o.value, text: o.text.trim() }))
);
console.log(`Probate / Middlesex case types (${caseTypes.length}):`);
for (const ct of caseTypes) {
  const interesting = /divorce|petition|complaint|separate|annul|family/i.test(ct.text);
  console.log(`   ${interesting ? '🎯' : '  '} value="${ct.value.trim()}" text="${ct.text}"`);
}

await browser.close();
