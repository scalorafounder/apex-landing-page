// Reconnoiter masscourts.org Smart Search interface.
// Goal: find how to filter by case type (Complaint for Divorce, Summary Process)
// and by court / date range / address or town.

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const DEBUG = path.resolve('./debug-masscourts');

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

  console.log(`   final URL: ${page.url()}`);

  // Find all visible links that look like search options
  const links = await page.$$eval('a, button', els =>
    els.filter(e => e.offsetParent !== null).map(e => ({
      text: (e.textContent || '').trim().slice(0, 80),
      href: e.getAttribute('href'),
      onclick: e.getAttribute('onclick'),
      id: e.id,
    })).filter(l => l.text)
  );
  console.log('\n🔗 Visible links/buttons (filtered):');
  for (const l of links) {
    if (/search|smart|case|public|portal/i.test(l.text + l.href + l.onclick)) {
      console.log(`   "${l.text}"  href="${l.href}"  id="${l.id}"`);
    }
  }

  // Capture body text for context
  const text = await page.evaluate(() => document.body.innerText);
  await writeFile(path.join(DEBUG, '01_home.txt'), text);
  console.log('\n=== HOME PAGE TEXT (first 3000 chars) ===\n');
  console.log(text.slice(0, 3000));

  // Look for reCAPTCHA elements
  console.log('\n🔎 Looking for reCAPTCHA...');
  const recaptcha = await page.evaluate(() => {
    const iframe = document.querySelector('iframe[src*="recaptcha"]');
    const checkbox = document.querySelector('.recaptcha-checkbox, .g-recaptcha, [class*="recaptcha"]');
    const sitekeyEl = document.querySelector('[data-sitekey]');
    return {
      hasIframe: !!iframe,
      iframeSrc: iframe?.src,
      hasCheckbox: !!checkbox,
      sitekey: sitekeyEl?.getAttribute('data-sitekey'),
    };
  });
  console.log(`   ${JSON.stringify(recaptcha, null, 2)}`);

  // Try clicking the reCAPTCHA checkbox via iframe
  const captchaFrame = page.frames().find(f => f.url().includes('recaptcha'));
  if (captchaFrame) {
    console.log('\n🖱️  Found reCAPTCHA iframe — clicking checkbox...');
    try {
      const cb = await captchaFrame.$('#recaptcha-anchor');
      if (cb) {
        await cb.click();
        console.log('   clicked. waiting 5s for either auto-pass or image challenge...');
        await page.waitForTimeout(5000);
        await page.screenshot({ path: path.join(DEBUG, '02_after_captcha_click.png'), fullPage: true });

        // Check if we got image challenge
        const challengeFrame = page.frames().find(f => f.url().includes('bframe'));
        const visibleChallenge = challengeFrame ? await challengeFrame.evaluate(() => {
          return document.querySelector('.rc-image-tile-overlay, .rc-imageselect-instructions') !== null;
        }).catch(() => false) : false;
        console.log(`   image challenge present: ${visibleChallenge}`);

        // Check if checkbox got the green check
        const passed = await captchaFrame.evaluate(() => {
          return document.querySelector('.recaptcha-checkbox-checked') !== null;
        }).catch(() => false);
        console.log(`   checkbox passed (auto): ${passed}`);
      }
    } catch (e) {
      console.log(`   error clicking checkbox: ${e.message}`);
    }
  }

  // Try the search link
  const searchLink = await page.$('a:has-text("Click Here To search public records"), a:has-text("public records")');
  if (searchLink) {
    console.log('\n🖱️  Clicking "Click Here To search public records"...');
    await searchLink.click();
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(DEBUG, '03_search_page.png'), fullPage: true });
    const t = await page.evaluate(() => document.body.innerText);
    await writeFile(path.join(DEBUG, '03_search_page.txt'), t);
    console.log(`   URL: ${page.url()}`);
    console.log('\n=== AFTER SEARCH-LINK CLICK (first 3000 chars) ===\n');
    console.log(t.slice(0, 3000));
  }

  console.log('\n⏸️  Browser staying open 60s for manual inspection');
  await page.waitForTimeout(60_000);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
