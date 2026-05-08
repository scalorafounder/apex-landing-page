// Recon: solve masscourts.org reCAPTCHA, navigate to the actual search interface,
// and dump everything about the search forms (case type filters, county filters,
// date range, paginated results format).
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { detectAndSolveRecaptcha } from './captcha.js';

const DEBUG = path.resolve('./debug-masscourts2');

async function main() {
  await mkdir(DEBUG, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  console.log('📂 Loading masscourts.org...');
  await page.goto('https://www.masscourts.org/eservices/home.page', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(DEBUG, '01_home.png'), fullPage: true });

  console.log('\n🔐 Solving reCAPTCHA...');
  const solved = await detectAndSolveRecaptcha(page);
  if (!solved) console.log('   no captcha detected');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(DEBUG, '02_captcha_solved.png'), fullPage: true });

  // Click "Click Here To search public records"
  console.log('\n🖱️  Clicking "search public records" link...');
  const searchLink = await page.$('a:has-text("search public records"), a:has-text("Click Here")');
  if (searchLink) {
    await searchLink.click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(4000);
    console.log(`   URL: ${page.url()}`);
    await page.screenshot({ path: path.join(DEBUG, '03_search_landing.png'), fullPage: true });

    const text = await page.evaluate(() => document.body.innerText);
    await writeFile(path.join(DEBUG, '03_search_landing.txt'), text);
    console.log('\n=== SEARCH LANDING PAGE (first 4000 chars) ===\n');
    console.log(text.slice(0, 4000));

    // Enumerate links and form elements
    const links = await page.$$eval('a, button', els =>
      els.filter(e => e.offsetParent !== null).map(e => ({
        text: (e.textContent || '').trim().slice(0, 80),
        href: e.getAttribute('href'),
        onclick: e.getAttribute('onclick'),
        id: e.id,
      })).filter(l => l.text)
    );
    console.log('\n🔗 Visible interactive elements:');
    for (const l of links) {
      if (/search|smart|case|criminal|civil|family|housing|probate|district/i.test(l.text + l.href + l.onclick)) {
        console.log(`   "${l.text}"  href="${l.href}"  id="${l.id}"`);
      }
    }

    const selects = await page.$$eval('select', els =>
      els.filter(el => el.offsetParent !== null).map(el => ({
        id: el.id, name: el.name,
        options: Array.from(el.options).slice(0, 50).map(o => o.text.trim()),
      }))
    );
    console.log(`\n📋 Selects on page (${selects.length}):`);
    for (const s of selects) {
      console.log(`   id="${s.id}" name="${s.name}" (${s.options.length} options)`);
      if (s.options.length <= 30) for (const o of s.options) console.log(`      - ${o}`);
    }

    const inputs = await page.$$eval('input', els =>
      els.filter(el => el.offsetParent !== null && el.type !== 'hidden').slice(0, 40).map(el => ({
        id: el.id, name: el.name, type: el.type, placeholder: el.placeholder, value: el.value?.slice(0, 30),
      }))
    );
    console.log(`\n📝 Visible inputs:`);
    for (const i of inputs) console.log(`   ${JSON.stringify(i)}`);
  } else {
    console.log('   ❌ search link not found — captcha may not have been solved');
  }

  // Select Housing Court → see what eviction-related fields appear
  console.log('\n🏛️  Selecting Housing Court...');
  await page.selectOption('select[name="sdeptCd"]', { label: 'Housing Court' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(DEBUG, '04_housing_court.png'), fullPage: true });

  let t = await page.evaluate(() => document.body.innerText);
  await writeFile(path.join(DEBUG, '04_housing_court.txt'), t);
  console.log('\n=== HOUSING COURT FORM ===\n');
  console.log(t.slice(0, 4000));

  let selects = await page.$$eval('select', els =>
    els.filter(el => el.offsetParent !== null).map(el => ({
      id: el.id, name: el.name,
      options: Array.from(el.options).slice(0, 80).map(o => o.text.trim()),
    }))
  );
  console.log(`\n📋 Selects after picking Housing Court (${selects.length}):`);
  for (const s of selects) {
    console.log(`   id="${s.id}" name="${s.name}" (${s.options.length} opts)`);
    if (s.options.length <= 60) for (const o of s.options) console.log(`      - ${o}`);
    else { console.log(`      first 20:`); for (const o of s.options.slice(0, 20)) console.log(`         - ${o}`); }
  }

  let inputs = await page.$$eval('input', els =>
    els.filter(el => el.offsetParent !== null && el.type !== 'hidden').slice(0, 40).map(el => ({
      id: el.id, name: el.name, type: el.type, placeholder: el.placeholder,
    }))
  );
  console.log(`\n📝 Inputs after picking Housing Court:`);
  for (const i of inputs) console.log(`   ${JSON.stringify(i)}`);

  // Drill into Eastern Housing Court
  console.log('\n🏛️  Selecting Eastern Housing Court division...');
  await page.selectOption('select[name="sdivCd"]', { label: 'Eastern Housing Court' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(DEBUG, '04b_eastern_housing.png'), fullPage: true });

  let t2 = await page.evaluate(() => document.body.innerText);
  console.log('\n=== EASTERN HOUSING COURT FORM ===\n');
  console.log(t2.slice(0, 4000));

  let selects2 = await page.$$eval('select', els =>
    els.filter(el => el.offsetParent !== null).map(el => ({
      id: el.id, name: el.name,
      options: Array.from(el.options).slice(0, 50).map(o => o.text.trim()),
    }))
  );
  console.log(`\n📋 Selects after picking Eastern Housing Court (${selects2.length}):`);
  for (const s of selects2) {
    console.log(`   id="${s.id}" name="${s.name}" (${s.options.length} opts)`);
    if (s.options.length <= 50) for (const o of s.options) console.log(`      - ${o}`);
  }

  let inputs2 = await page.$$eval('input', els =>
    els.filter(el => el.offsetParent !== null && el.type !== 'hidden').slice(0, 40).map(el => ({
      id: el.id, name: el.name, type: el.type, placeholder: el.placeholder,
    }))
  );
  console.log(`\n📝 Inputs after picking Eastern Housing Court:`);
  for (const i of inputs2) console.log(`   ${JSON.stringify(i)}`);

  let buttons2 = await page.$$eval('button, input[type="submit"]', els =>
    els.filter(el => el.offsetParent !== null).map(el => ({
      id: el.id, text: (el.textContent || el.value || '').trim(),
    }))
  );
  console.log(`\n🔘 Buttons:`);
  for (const b of buttons2) console.log(`   ${JSON.stringify(b)}`);

  // Now switch to Probate and pick Middlesex
  console.log('\n🏛️  Switching to Probate → Middlesex...');
  await page.selectOption('select[name="sdeptCd"]', { label: 'Probate and Family Court' });
  await page.waitForTimeout(4000);

  t = await page.evaluate(() => document.body.innerText);
  await writeFile(path.join(DEBUG, '05_probate.txt'), t);
  console.log('\n=== PROBATE FORM ===\n');
  console.log(t.slice(0, 3000));

  selects = await page.$$eval('select', els =>
    els.filter(el => el.offsetParent !== null).map(el => ({
      id: el.id, name: el.name,
      options: Array.from(el.options).slice(0, 80).map(o => o.text.trim()),
    }))
  );
  console.log(`\n📋 Selects after picking Probate (${selects.length}):`);
  for (const s of selects) {
    console.log(`   id="${s.id}" name="${s.name}" (${s.options.length} opts)`);
    if (s.options.length <= 60) for (const o of s.options) console.log(`      - ${o}`);
    else { console.log(`      first 30:`); for (const o of s.options.slice(0, 30)) console.log(`         - ${o}`); }
  }

  console.log('\n⏸️  Browser open 30s for manual inspection');
  await page.waitForTimeout(30_000);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
