// 2Captcha integration for solving reCAPTCHA v2 challenges.
// API: https://2captcha.com/2captcha-api
//
// Usage:
//   import { solveRecaptcha, injectRecaptchaToken } from '../lib/captcha.js';
//   const token = await solveRecaptcha({ sitekey, pageUrl });
//   await injectRecaptchaToken(page, token);
//   // continue with form submission

import 'dotenv/config';
import { fetch } from 'undici';

const KEY = process.env.TWOCAPTCHA_API_KEY;
const IN_URL = 'http://2captcha.com/in.php';
const RES_URL = 'http://2captcha.com/res.php';

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 36;     // 36 × 5s = 3 min — usually solves in 30-60s

/**
 * Submit a reCAPTCHA v2 task to 2Captcha, poll until solved, return the token.
 * @param {object} opts
 * @param {string} opts.sitekey  reCAPTCHA site key (data-sitekey from page)
 * @param {string} opts.pageUrl  Full URL of the page hosting the captcha
 * @param {boolean} [opts.invisible] true for v2 invisible
 * @returns {Promise<string>} g-recaptcha-response token
 */
export async function solveRecaptcha({ sitekey, pageUrl, invisible = false }) {
  if (!KEY) throw new Error('TWOCAPTCHA_API_KEY not set in environment');

  // Submit task
  const submitParams = new URLSearchParams({
    key: KEY,
    method: 'userrecaptcha',
    googlekey: sitekey,
    pageurl: pageUrl,
    json: '1',
  });
  if (invisible) submitParams.set('invisible', '1');

  const subRes = await fetch(`${IN_URL}?${submitParams}`);
  const subData = await subRes.json();
  if (subData.status !== 1) {
    throw new Error(`2Captcha submit failed: ${subData.request || JSON.stringify(subData)}`);
  }
  const taskId = String(subData.request);
  console.log(`   🤖 2Captcha task submitted: ${taskId} (waiting up to ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s)`);

  // Poll for solution
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const pollUrl = `${RES_URL}?key=${KEY}&action=get&id=${taskId}&json=1`;
    const pollRes = await fetch(pollUrl);
    const pollData = await pollRes.json();

    if (pollData.status === 1) {
      const elapsed = (attempt * POLL_INTERVAL_MS) / 1000;
      console.log(`   🤖 2Captcha solved in ${elapsed}s (token len=${pollData.request.length})`);
      return pollData.request;
    }
    if (pollData.request !== 'CAPCHA_NOT_READY') {
      throw new Error(`2Captcha error: ${pollData.request}`);
    }
    if (attempt % 6 === 0) {
      console.log(`   🤖 still waiting... ${(attempt * POLL_INTERVAL_MS) / 1000}s elapsed`);
    }
  }
  throw new Error(`2Captcha timed out after ${MAX_POLL_ATTEMPTS} polls`);
}

/**
 * Inject a solved reCAPTCHA token into the page's g-recaptcha-response field
 * and trigger any callback the site has registered.
 */
export async function injectRecaptchaToken(page, token) {
  await page.evaluate((tok) => {
    // Standard textarea injection
    const textareas = document.querySelectorAll('textarea[name="g-recaptcha-response"], textarea#g-recaptcha-response');
    textareas.forEach(t => {
      t.style.display = 'block';
      t.value = tok;
      t.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // If the page registered a callback, invoke it
    if (typeof window.___grecaptcha_cfg !== 'undefined' && window.___grecaptcha_cfg.clients) {
      const clients = window.___grecaptcha_cfg.clients;
      Object.keys(clients).forEach(cid => {
        const client = clients[cid];
        Object.values(client).forEach((widget) => {
          if (widget && typeof widget === 'object') {
            Object.values(widget).forEach((sub) => {
              if (sub && typeof sub.callback === 'function') {
                try { sub.callback(tok); } catch (e) { /* ignore */ }
              }
            });
          }
        });
      });
    }
  }, token);
}

/**
 * Convenience: detect a reCAPTCHA on the page and solve it end-to-end.
 * Returns true if a captcha was found and solved, false if no captcha present.
 */
export async function detectAndSolveRecaptcha(page) {
  const captcha = await page.evaluate(() => {
    const sitekeyEl = document.querySelector('[data-sitekey]');
    const iframe = document.querySelector('iframe[src*="recaptcha"]');
    return {
      sitekey: sitekeyEl?.getAttribute('data-sitekey') || null,
      iframeSrc: iframe?.src || null,
      url: window.location.href,
    };
  });

  // Sometimes the sitekey is in the iframe URL
  let sitekey = captcha.sitekey;
  if (!sitekey && captcha.iframeSrc) {
    const m = captcha.iframeSrc.match(/[?&]k=([^&]+)/);
    if (m) sitekey = m[1];
  }

  if (!sitekey) return false;

  console.log(`   🔐 Found reCAPTCHA (sitekey: ${sitekey.slice(0, 20)}...)`);
  const token = await solveRecaptcha({ sitekey, pageUrl: captcha.url });
  await injectRecaptchaToken(page, token);
  return true;
}
