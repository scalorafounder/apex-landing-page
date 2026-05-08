// Find what controls the active sub-tab (Name vs Case Type vs Case Number vs Ticket)
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { detectAndSolveRecaptcha } from './captcha.js';

const DEBUG = path.resolve('./debug-masscourts4');

async function main() {
  await mkdir(DEBUG, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
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

  await page.selectOption('select[name="sdeptCd"]', { label: 'Housing Court' });
  await page.waitForTimeout(2500);
  await page.selectOption('select[name="sdivCd"]', { label: 'Eastern Housing Court' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(DEBUG, '01_form.png'), fullPage: true });

  // Dump ALL form elements (including hidden) so we find the hidden tab indicator
  const allFormFields = await page.evaluate(() => {
    const els = document.querySelectorAll('form input, form select, form button, input, select, button');
    return [...els].map(e => ({
      tag: e.tagName,
      type: e.type,
      name: e.name,
      id: e.id,
      value: e.value?.slice(0, 40),
      checked: e.checked,
      visible: e.offsetParent !== null,
    })).filter(f => f.name);
  });
  console.log(`📋 ALL form fields (${allFormFields.length}):`);
  for (const f of allFormFields) {
    console.log(`   ${f.tag} ${f.type} name="${f.name}" id="${f.id}" value="${f.value}" checked=${f.checked} vis=${f.visible}`);
  }

  // Look for the radio buttons / hidden tab indicator
  console.log('\n🔍 Looking for sub-tab radio/control...');
  const subTabs = await page.evaluate(() => {
    // Search for elements with text "Name", "Case Type", "Case Number", "Ticket/Citation"
    const labels = ['Name', 'Case Type', 'Case Number', 'Ticket/Citation'];
    const results = [];
    for (const label of labels) {
      const matching = [...document.querySelectorAll('a, button, span, div, li, label')]
        .filter(e => {
          const direct = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent?.trim()).filter(Boolean).join(' ');
          return direct === label && e.offsetParent !== null;
        });
      for (const m of matching.slice(0, 3)) {
        results.push({
          label,
          tag: m.tagName,
          id: m.id,
          cls: m.className,
          parent: m.parentElement?.tagName,
          parentCls: m.parentElement?.className,
          parentRole: m.parentElement?.getAttribute('role'),
          onclick: m.getAttribute('onclick'),
          dataAttrs: [...m.attributes].filter(a => a.name.startsWith('data-')).map(a => `${a.name}=${a.value}`),
        });
      }
    }
    return results;
  });
  for (const t of subTabs) console.log(`   ${JSON.stringify(t)}`);

  // Check for the parent elements wrapping these labels — maybe a tab container
  console.log('\n🔍 Looking for clickable Case Type element + clicking it...');
  const beforeHTML = await page.content();
  const ctEl = await page.locator(':has-text("Case Type")').first();

  // Try clicking it programmatically
  const clickResult = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('*')]
      .filter(e => {
        const direct = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent?.trim()).filter(Boolean).join(' ');
        return direct === 'Case Type' && e.offsetParent !== null;
      })
      .slice(0, 5);
    const results = [];
    for (const c of candidates) {
      results.push({
        tag: c.tagName, id: c.id, cls: c.className,
        outerHTML: c.outerHTML.slice(0, 200),
      });
      try { c.click(); } catch (e) {}
    }
    return results;
  });
  console.log(`   clicked candidates:`);
  for (const r of clickResult) console.log(`      ${JSON.stringify(r)}`);

  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(DEBUG, '02_after_clicks.png'), fullPage: true });

  // Now check what changed in form state
  const afterFormFields = await page.evaluate(() => {
    const els = document.querySelectorAll('input[type="hidden"], input[type="radio"]');
    return [...els].map(e => ({
      type: e.type, name: e.name, id: e.id, value: e.value?.slice(0, 60), checked: e.checked,
    })).filter(f => f.name);
  });
  console.log(`\n📋 Hidden + radio inputs after click:`);
  for (const f of afterFormFields) {
    console.log(`   ${f.type} name="${f.name}" id="${f.id}" value="${f.value}" checked=${f.checked}`);
  }

  console.log('\n⏸️  Browser open 60s for manual inspection');
  await page.waitForTimeout(60_000);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
