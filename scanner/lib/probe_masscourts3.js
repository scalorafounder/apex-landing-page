// Tertiary recon: get all the way to "Case Type" tab and inspect the form there.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { detectAndSolveRecaptcha } from './captcha.js';

const DEBUG = path.resolve('./debug-masscourts3');

async function main() {
  await mkdir(DEBUG, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  console.log('📂 Loading masscourts.org home...');
  await page.goto('https://www.masscourts.org/eservices/home.page', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(3000);

  console.log('🔐 Solving reCAPTCHA...');
  await detectAndSolveRecaptcha(page);
  await page.waitForTimeout(2000);

  console.log('🖱️  Click search...');
  await page.click('a:has-text("search public records"), a:has-text("Click Here")');
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);

  console.log('🏛️  Pick Housing Court → Eastern Housing Court...');
  await page.selectOption('select[name="sdeptCd"]', { label: 'Housing Court' });
  await page.waitForTimeout(2500);
  await page.selectOption('select[name="sdivCd"]', { label: 'Eastern Housing Court' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(DEBUG, '01_after_division.png'), fullPage: true });

  // Dump all clickable elements that contain "Case Type"
  console.log('\n🔍 All elements containing "Case Type" text:');
  const caseTypeEls = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    const matches = [];
    for (const el of all) {
      const directText = [...el.childNodes]
        .filter(n => n.nodeType === 3)
        .map(n => n.textContent?.trim())
        .filter(Boolean)
        .join(' ');
      if (/^Case Type$/i.test(directText)) {
        matches.push({
          tag: el.tagName,
          id: el.id,
          cls: el.className,
          parentTag: el.parentElement?.tagName,
          parentCls: el.parentElement?.className,
          parentRole: el.parentElement?.getAttribute('role'),
          isVisible: el.offsetParent !== null,
        });
      }
    }
    return matches;
  });
  for (const e of caseTypeEls) console.log(`   ${JSON.stringify(e)}`);

  // List all elements with role="tab" or class containing "tab"
  console.log('\n🔍 All tab-like elements:');
  const tabs = await page.evaluate(() => {
    const els = document.querySelectorAll('[role="tab"], li.tab, .ui-tab, [class*="tab"]');
    return [...els].filter(e => e.offsetParent !== null).map(e => ({
      tag: e.tagName, id: e.id, cls: e.className, role: e.getAttribute('role'),
      text: (e.textContent || '').trim().slice(0, 60),
    }));
  });
  for (const t of tabs.slice(0, 30)) console.log(`   ${JSON.stringify(t)}`);

  // Try clicking on the Case Type text directly
  console.log('\n🖱️  Trying various ways to click "Case Type"...');
  const tries = [
    'a:has-text("Case Type")',
    'span:has-text("Case Type")',
    'div:has-text("Case Type")',
    'li:has-text("Case Type")',
    'button:has-text("Case Type")',
    '*:has-text("Case Type")',
  ];

  for (const sel of tries) {
    try {
      const els = await page.$$(sel);
      console.log(`   "${sel}" → ${els.length} matches`);
      if (els.length > 0 && els.length < 5) {
        for (let i = 0; i < els.length; i++) {
          const tag = await els[i].evaluate(e => e.tagName);
          const text = await els[i].evaluate(e => e.textContent?.trim().slice(0, 50));
          console.log(`      [${i}] ${tag} "${text}"`);
        }
      }
    } catch (e) {}
  }

  // Try clicking the first one that's a tab (often <li> or <a>)
  console.log('\n🖱️  Clicking li:has-text("Case Type")...');
  try {
    const tab = await page.locator('li:has-text("Case Type")').first();
    if (await tab.count()) {
      await tab.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(DEBUG, '02_after_tab_click.png'), fullPage: true });
      const text = await page.evaluate(() => document.body.innerText);
      await writeFile(path.join(DEBUG, '02_after_tab_click.txt'), text);
      console.log('\n=== AFTER CASE TYPE TAB CLICK ===\n');
      console.log(text.slice(0, 4000));

      const selects = await page.$$eval('select', els =>
        els.filter(el => el.offsetParent !== null).map(el => ({
          id: el.id, name: el.name,
          options: [...el.options].slice(0, 60).map(o => o.text.trim()),
        }))
      );
      console.log(`\n📋 Selects after tab click (${selects.length}):`);
      for (const s of selects) {
        console.log(`   id="${s.id}" name="${s.name}" (${s.options.length} opts)`);
        if (s.options.length <= 60) for (const o of s.options) console.log(`      - ${o}`);
      }

      const inputs = await page.$$eval('input', els =>
        els.filter(el => el.offsetParent !== null && el.type !== 'hidden').slice(0, 30).map(el => ({
          id: el.id, name: el.name, type: el.type, placeholder: el.placeholder,
        }))
      );
      console.log(`\n📝 Inputs after tab click:`);
      for (const i of inputs) console.log(`   ${JSON.stringify(i)}`);
    }
  } catch (e) { console.log(`   error: ${e.message}`); }

  console.log('\n⏸️  Browser open 60s for inspection');
  await page.waitForTimeout(60_000);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
