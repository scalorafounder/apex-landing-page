// Test if Plymouth and Essex South Registry are accessible via masslandrecords.com
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
});

const tests = [
  'http://www.masslandrecords.com/Plymouth',
  'http://www.masslandrecords.com/EssexSouth',
  'http://www.masslandrecords.com/Essex',
  'http://www.masslandrecords.com/Norfolk',
];

for (const url of tests) {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(2000);
    const finalUrl = page.url();
    const title = await page.title();
    const hasSearchDropdown = await page.$('#SearchCriteriaName1_DDL_SearchName').then(el => !!el).catch(() => false);
    console.log(`\n${url}`);
    console.log(`   final URL: ${finalUrl}`);
    console.log(`   title: ${title}`);
    console.log(`   has masslandrecords search dropdown: ${hasSearchDropdown}`);
  } catch (e) {
    console.log(`\n${url}`);
    console.log(`   ❌ ${e.message}`);
  }
  await page.close();
}

await browser.close();
