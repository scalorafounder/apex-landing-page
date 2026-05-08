// Probe Norfolk ALIS Entry Date search and look at actual results.
// Goal: figure out result page structure + how to navigate to detail
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const DEBUG = path.resolve('./debug-norfolk-results');

async function main() {
  await mkdir(DEBUG, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  // Direct URL to the Entry Date search form
  console.log('📂 Loading Entry Date search form...');
  await page.goto('https://www.norfolkresearch.org/ALIS/WW400R.HTM?WSIQTP=LR09D&WSKYCD=E', {
    waitUntil: 'networkidle',
    timeout: 30_000,
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(DEBUG, '01_form.png'), fullPage: true });

  // Inspect form fields and find the actual submit button
  const forms = await page.$$eval('form', forms => forms.map(f => ({
    action: f.action,
    method: f.method,
    name: f.name,
    inputs: Array.from(f.querySelectorAll('input,select,button')).map(i => ({
      name: i.name, id: i.id, type: i.type, value: i.value, tag: i.tagName,
    })),
  })));
  console.log('📋 Forms on page:');
  for (const f of forms) {
    console.log(`   action=${f.action} method=${f.method}`);
    for (const i of f.inputs) {
      if (i.name || i.value) console.log(`      ${i.tag} name="${i.name}" id="${i.id}" type="${i.type}" value="${i.value?.slice(0, 40)}"`);
    }
  }

  // Submit a wide search: last 30 days, all towns, lien doc type group
  console.log('\n🧪 Submitting search: 04/06 → 05/06, all towns, *Lien document group...');
  await page.fill('input[name="W9FDTA"]', '04062026');
  await page.fill('input[name="W9TDTA"]', '05062026');

  // Select the *Lien document group (catch-all for all lien types)
  await page.selectOption('select[name="W9ABR"]', { label: '*Lien document group' });

  // Find submit button — the one with no name in the form
  const submitClicked = await page.evaluate(() => {
    // Find the submit button INSIDE the search form (not in nav)
    const forms = document.querySelectorAll('form');
    for (const f of forms) {
      const submits = f.querySelectorAll('input[type="submit"], button[type="submit"]');
      for (const s of submits) {
        // Search button is the one in the body of the search form
        if (s.value === '' || s.value === 'Search' || s.value === 'Submit' ||
            (s.value && /search|find|go/i.test(s.value))) {
          // Check it's near the date inputs (heuristic)
          const dateInput = f.querySelector('input[name="W9FDTA"]');
          if (dateInput) {
            s.click();
            return { clicked: true, value: s.value, formAction: f.action };
          }
        }
      }
    }
    return { clicked: false };
  });
  console.log(`   ${JSON.stringify(submitClicked)}`);

  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(DEBUG, '02_results.png'), fullPage: true });
  console.log(`   URL after submit: ${page.url()}`);

  const text = await page.evaluate(() => document.body.innerText);
  await writeFile(path.join(DEBUG, '02_results.txt'), text);
  const html = await page.content();
  await writeFile(path.join(DEBUG, '02_results.html'), html);
  console.log('\n=== RESULT PAGE TEXT (first 4000 chars) ===\n');
  console.log(text.slice(0, 4000));

  console.log('\n⏸️  Browser open 60s for inspection');
  await page.waitForTimeout(60_000);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
