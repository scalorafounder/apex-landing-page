const express = require('express');
const https = require('https');
const http = require('http');
const { chromium } = require('playwright');
const { parseNotice } = require('./parse');
const { batchTrace } = require('./tracerfy');

const app = express();
app.use(express.json());

const TWOCAPTCHA_KEY = '1d16836781195d998fddcb9a06fd4c39';
const RECAPTCHA_SITE_KEY = '6LfPOg8sAAAAAEwHZnqLtOk7Jdc43bvUG_Sm1fDq';

// pdf-parse — this module exports a named export PDFParse, not a default function
const { PDFParse } = require('pdf-parse');

// Anthropic API for AI address extraction from legal descriptions
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// In-memory async job store
const jobStore = new Map(); // jobId -> { status, result, error, startedAt }
let jobCounter = 0;

function httpGet(url) {
  return new Promise(function(resolve, reject) {
    var mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(httpGet(res.headers.location));
      var chunks = [];
      res.on('data', function(c) { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); });
      res.on('end', function() { var buf = Buffer.concat(chunks); resolve({ status: res.statusCode, body: buf.toString('utf-8'), buffer: buf }); });
    }).on('error', reject);
  });
}

async function zipToCounty(zip) {
  const zipRes = await httpGet('https://api.zippopotam.us/us/' + zip);
  if (zipRes.status !== 200) throw new Error('Zip lookup failed for ' + zip);
  const place = JSON.parse(zipRes.body).places[0];
  const fccRes = await httpGet('https://geo.fcc.gov/api/census/block/find?latitude=' + place.latitude + '&longitude=' + place.longitude + '&format=json');
  let countyName = place['place name'], fips = 'unknown';
  if (fccRes.status === 200) {
    try { const f = JSON.parse(fccRes.body); if (f.County) { countyName = f.County.name; fips = f.County.FIPS; } } catch(e) {}
  }
  return { county_name: countyName, state_name: place['state'], state_abbr: place['state abbreviation'], city: place['place name'], fips };
}

async function submit2CaptchaTask(pageUrl) {
  var url = 'http://2captcha.com/in.php?key=' + TWOCAPTCHA_KEY + '&method=userrecaptcha&googlekey=' + encodeURIComponent(RECAPTCHA_SITE_KEY) + '&pageurl=' + encodeURIComponent(pageUrl) + '&json=1';
  var res = await httpGet(url);
  var data = JSON.parse(res.body);
  if (data.status !== 1) throw new Error('2Captcha submit failed: ' + res.body);
  return String(data.request);
}

async function poll2CaptchaTask(taskId) {
  for (var i = 0; i < 36; i++) {
    await new Promise(function(r) { setTimeout(r, 5000); });
    var res = await httpGet('http://2captcha.com/res.php?key=' + TWOCAPTCHA_KEY + '&action=get&id=' + taskId + '&json=1');
    var data = JSON.parse(res.body);
    if (data.status === 1) return data.request;
    if (data.request !== 'CAPCHA_NOT_READY') throw new Error('2Captcha error: ' + res.body);
  }
  throw new Error('2Captcha timed out for task ' + taskId);
}

async function solveAllCaptchas(detailUrls) {
  console.log('Submitting ' + detailUrls.length + ' CAPTCHA tasks...');
  var taskIds = await Promise.all(detailUrls.map(function(url) {
    return submit2CaptchaTask(url).catch(function(e) { console.log('Submit error:', e.message); return null; });
  }));
  console.log('Tasks submitted. Waiting ~90s for solutions...');
  var tokens = await Promise.all(taskIds.map(function(id) {
    if (!id) return null;
    return poll2CaptchaTask(id).catch(function(e) { console.log('Poll error task ' + id + ':', e.message); return null; });
  }));
  console.log('CAPTCHAs solved: ' + tokens.filter(function(t) { return t; }).length + '/' + detailUrls.length);
  return tokens;
}

function extractAddressFromText(text) {
  if (!text || text.length < 10) return { address: '', city: '' };
  var address = '', city = '', m;
  m = text.match(/Property\s+Address:\s*\n?([\s\S]+?)(?=\s*(?:Security\s+Deed|County:|Book\s+[A-Z]|\n\n|PLEASE\s+TAKE|Under\s+and\s+by))/i);
  if (m) address = m[1].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().replace(/,\s*$/, '');
  if (!address) {
    m = text.match(/(?:being\s+)?located at\s+([^\n.;]+(?:,\s*[A-Za-z\s]+,\s*GA\s*\d{5})?)/i);
    if (m) address = m[1].trim();
  }
  if (!address) {
    m = text.match(/(?:commonly\s+)?(?:being\s+)?known as\s+([^\n.;,]+(?:,\s*[A-Za-z\s]+(?:,\s*GA\s*\d{5})?)?)/i);
    if (m) address = m[1].trim();
  }
  if (!address) {
    m = text.match(/to\s+wit[:\s]+([^\n.;]+(?:,\s*[A-Za-z\s]+,\s*GA\s*\d{5})?)/i);
    if (m) address = m[1].trim();
  }
  if (!address) {
    m = text.match(/the property (?:known as|described as|located at)\s+([^\n]+?,\s*[A-Za-z\s]+,\s*(?:Georgia|GA)\s*\d{5})/i);
    if (m) address = m[1].trim();
  }
  if (!address) {
    m = text.match(/(?:street\s+)?[Aa]ddress:\s*\n?([^\n]+)/);
    if (m) address = m[1].replace(/\n/g, ' ').trim();
  }
  if (address) {
    var cm = address.match(/,\s*([A-Za-z][A-Za-z\s]+?),\s*(?:Georgia|GA)\s*\d{5}/i);
    if (cm) city = cm[1].trim();
  }
  if (address && (!/\d/.test(address) || address.length > 200)) { address = ''; city = ''; }
  return { address: address, city: city };
}

async function parsePdfText(pdfBuffer) {
  try {
    var parser = new PDFParse();
    var data = await parser.parse(pdfBuffer);
    return data.text || '';
  } catch(e) {
    console.log('pdf-parse error:', e.message);
    return '';
  }
}

// Use Claude to extract street address from legal notice text (legal descriptions included)
async function aiExtractAddress(noticeText) {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    var body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: 'Extract ONLY the street address (house number + street name + city + state + zip if present) from this Georgia foreclosure notice. Return JUST the address on one line, nothing else. If no street address is found (only a legal/lot description), return exactly: NONE\n\nNotice text:\n' + noticeText.substring(0, 3000)
      }]
    });
    var res = await new Promise(function(resolve, reject) {
      var req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body)
        }
      }, function(r) {
        var chunks = [];
        r.on('data', function(c) { chunks.push(c); });
        r.on('end', function() { resolve(JSON.parse(Buffer.concat(chunks).toString())); });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    var text = res.content && res.content[0] && res.content[0].text ? res.content[0].text.trim() : '';
    if (!text || text === 'NONE' || text.toUpperCase() === 'NONE') return null;
    // Validate: must have digits
    if (!/\d/.test(text) || text.length > 200) return null;
    return text;
  } catch(e) {
    console.log('AI extract error:', e.message);
    return null;
  }
}

async function getDetailInfo(context, session, internalId, token) {
  var detailPage = null;
  try {
    detailPage = await context.newPage();
    var detailUrl = 'https://www.georgiapublicnotice.com/(S(' + session + '))/Details.aspx?SID=' + session + '&ID=' + internalId;
    await detailPage.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await detailPage.waitForTimeout(1500);

    var agreeBtn = await detailPage.$('input[value="I Agree, View Notice"]');
    if (!agreeBtn) {
      var txt = await detailPage.evaluate(function() { return document.body.innerText; });
      await detailPage.close();
      return extractAddressFromText(txt);
    }

    if (token) {
      await detailPage.evaluate(function(tok) {
        var ta = document.querySelector('textarea[name="g-recaptcha-response"]');
        if (ta) ta.value = tok;
      }, token);
    }

    await Promise.all([
      detailPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(function() {}),
      agreeBtn.click()
    ]);
    await detailPage.waitForTimeout(3000);

    var info = await detailPage.evaluate(function() {
      var pdfUrl = null;
      document.querySelectorAll('a').forEach(function(a) {
        if (a.href && a.href.includes('PDFDocument.aspx')) pdfUrl = a.href;
      });
      var body = document.body.innerText;
      // Check if agree is still showing (CAPTCHA didn't work)
      var stillGated = body.includes('I agree to the Terms of Use') && body.length < 600;
      var cm = body.match(/Notice\s+Content\s*\n([\s\S]{50,2500}?)(?:Web display limited|$)/i);
      return { pdfUrl: pdfUrl, noticeText: cm ? cm[1] : body.substring(0, 2500), stillGated: stillGated, bodyLen: body.length };
    });

    if (info.stillGated) {
      console.log('  CAPTCHA rejected for ID=' + internalId + ' - still on terms page');
    } else {
      console.log('  Agreed OK ID=' + internalId + ' pdfUrl=' + (info.pdfUrl ? 'YES' : 'NO') + ' bodyLen=' + info.bodyLen);
    }

    await detailPage.close();
    detailPage = null;

    var fromDisplay = extractAddressFromText(info.noticeText);
    if (fromDisplay.address) {
      console.log('  Regex addr ID=' + internalId + ': ' + fromDisplay.address);
      return fromDisplay;
    }

    // Try PDF if available
    var fullText = info.noticeText;
    if (info.pdfUrl) {
      console.log('  Downloading PDF for ID=' + internalId);
      var pdfRes = await httpGet(info.pdfUrl);
      if (pdfRes.status === 200 && pdfRes.buffer.length > 100) {
        var pdfText = await parsePdfText(pdfRes.buffer);
        if (pdfText) fullText = pdfText;
        var fromPdf = extractAddressFromText(pdfText);
        if (fromPdf.address) {
          console.log('  PDF regex addr ID=' + internalId + ': ' + fromPdf.address);
          return fromPdf;
        }
      }
    }

    // Fall back to AI extraction from full notice text
    if (fullText && fullText.length > 200) {
      console.log('  AI extracting addr ID=' + internalId + ' (textlen=' + fullText.length + ')');
      var aiAddr = await aiExtractAddress(fullText);
      if (aiAddr) {
        console.log('  AI addr ID=' + internalId + ': ' + aiAddr);
        // Extract city from AI result
        var cityM = aiAddr.match(/,\s*([A-Za-z][A-Za-z\s]+?),\s*(?:Georgia|GA)\s*\d{5}/i);
        return { address: aiAddr, city: cityM ? cityM[1].trim() : '' };
      }
    }

    console.log('  No address for ID=' + internalId + (info.pdfUrl ? '' : ' (no PDF)'));
    return { address: '', city: '' };
  } catch(e) {
    console.log('  Detail err ID=' + internalId + ': ' + e.message.substring(0, 80));
    if (detailPage) { try { await detailPage.close(); } catch(e2) {} }
    return { address: '', city: '' };
  }
}

async function callOpenClaw(prompt, maxTokens, timeoutMs) {
  const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;
  const OPENCLAW_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18790';
  const res = await fetch(OPENCLAW_URL + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENCLAW_TOKEN, 'x-openclaw-agent-id': 'commander' },
    body: JSON.stringify({ model: 'openclaw', max_tokens: maxTokens || 300, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(timeoutMs || 45000),
  });
  if (!res.ok) throw new Error('OpenClaw HTTP ' + res.status + ': ' + await res.text());
  const data = await res.json();
  return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
}

async function scrapeGeorgiaListPage(page, pageNum) {
  if (pageNum > 1) {
    try {
      var nb = await page.$("a[href*='Page$" + pageNum + "']") || await page.$("a[href*='Page$Next']");
      if (!nb) return null;
      await nb.click();
      await page.waitForTimeout(2500);
    } catch(e) { return null; }
  }
  return await page.evaluate(function() {
    var rows = [];
    document.querySelectorAll('table tr').forEach(function(row, i) {
      if (i === 0) return;
      var text = (row.innerText || '').trim();
      if (text.length > 30) rows.push(text);
    });
    var ids = [], seen = new Set();
    document.querySelectorAll('input[onclick*="Details.aspx"]').forEach(function(b) {
      var m = (b.getAttribute('onclick') || '').match(/ID=(\d+)/i);
      if (m && !seen.has(m[1])) { ids.push(m[1]); seen.add(m[1]); }
    });
    var sm = window.location.href.match(/\(S\(([^)]+)\)\)/);
    return { rows: rows, internalIds: ids, session: sm ? sm[1] : '' };
  });
}

async function scrapeGeorgia(countyInfo, maxLeads) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  var session = '';

  try {
    await page.goto('https://www.georgiapublicnotice.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const sel = "select[name='ctl00$ContentPlaceHolder1$as1$ddlPopularSearches']";
    await page.waitForSelector(sel, { timeout: 10000 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.selectOption(sel, { label: 'Foreclosures' })
    ]);

    const targetCounty = countyInfo.county_name.replace(/\s*County\s*$/i, '').trim();

    // Set per-page FIRST (before county filter) so it doesn't reset the county selection
    const ppEl = await page.$("select[name*='ddlPerPage']");
    if (ppEl) {
      const opts = await ppEl.evaluate(function(s) { return Array.from(s.options).map(function(o) { return o.value; }); });
      const best = opts.includes('50') ? '50' : opts.includes('30') ? '30' : opts[opts.length - 1];
      await ppEl.selectOption(best);
      await page.waitForTimeout(3000);
      console.log('Per-page: ' + best);
    }

    // Apply county filter AFTER per-page is set
    let countyFound = false;
    try {
      await page.waitForSelector('input[name*="lstCounty"]', { timeout: 8000, state: 'attached' });
      const triggered = await page.evaluate(function(tc) {
        var cbs = document.querySelectorAll('input[name*="lstCounty"]');
        for (var i = 0; i < cbs.length; i++) {
          var cb = cbs[i];
          var label = cb.id ? document.querySelector('label[for="' + cb.id + '"]') : null;
          var t = label ? label.innerText.trim() : '';
          if (!t) { var s = cb.nextSibling; t = (s && s.nodeType === 3) ? s.textContent.trim() : ''; }
          if (!t && cb.nextElementSibling) t = cb.nextElementSibling.innerText.trim();
          if (t.toLowerCase() === tc.toLowerCase()) { cb.checked = true; cb.click(); return t; }
        }
        return null;
      }, targetCounty);
      if (triggered) {
        countyFound = true;
        console.log('County clicked: ' + triggered);
        await page.waitForTimeout(6000); // wait for AJAX to complete
        // Verify county filter applied by checking first result's county text
        var firstCounty = await page.evaluate(function() {
          var rows = document.querySelectorAll('table tr');
          for (var i = 1; i < Math.min(5, rows.length); i++) {
            var t = (rows[i].innerText || '').substring(0, 200);
            if (t.length > 20) return t;
          }
          return '';
        });
        console.log('First result after county filter: ' + firstCounty.replace(/\n/g,' ').substring(0, 100));
      } else { console.log('County "' + targetCounty + '" not found - post-filtering'); }
    } catch(e) { console.log('County filter error: ' + e.message); }

    // Phase 1: list page scraping
    const seen = new Set(), noticeGroups = [];
    let pageNum = 1;
    while (noticeGroups.length < maxLeads && pageNum <= 20) {
      console.log('GA list page ' + pageNum + '...');
      const pd = await scrapeGeorgiaListPage(page, pageNum);
      if (!pd || !pd.rows || pd.rows.length === 0) break;
      if (pd.session) session = pd.session;
      pd.rows.forEach(function(rawText, idx) {
        const parsed = parseNotice(rawText);
        const internalId = pd.internalIds[idx] || null;
        if (!internalId || seen.has(internalId)) return;
        seen.add(internalId);
        if (!countyFound && parsed.county && parsed.county.toLowerCase().indexOf(targetCounty.toLowerCase()) === -1) return;
        noticeGroups.push({ internalId: internalId, ownerName: parsed.ownerName, noticeId: parsed.noticeId, county: parsed.county || countyInfo.county_name, filingDate: parsed.filingDate });
      });
      pageNum++;
    }
    console.log('List scraping done: ' + noticeGroups.length + ' notices');

    if (!session) {
      session = await page.evaluate(function() { var m = window.location.href.match(/\(S\(([^)]+)\)\)/); return m ? m[1] : ''; });
    }
    console.log('Session: ' + session.substring(0, 20) + '...');

    const toProcess = noticeGroups.slice(0, maxLeads);
    if (toProcess.length === 0) { await browser.close(); return []; }

    // Phase 2: parallel CAPTCHA solving
    const detailUrls = toProcess.map(function(g) {
      return 'https://www.georgiapublicnotice.com/(S(' + session + '))/Details.aspx?SID=' + session + '&ID=' + g.internalId;
    });
    const captchaTokens = await solveAllCaptchas(detailUrls);

    // Phase 3: detail pages in batches of 3
    console.log('Processing ' + toProcess.length + ' detail pages...');
    const leads = [];
    for (var i = 0; i < toProcess.length; i += 3) {
      const batch = toProcess.slice(i, i + 3);
      const results = await Promise.all(batch.map(function(n, j) {
        return getDetailInfo(context, session, n.internalId, captchaTokens[i + j]);
      }));
      results.forEach(function(r, j) {
        var n = batch[j];
        leads.push({
          owner_name: n.ownerName,
          property_address: r.address,
          county: n.county,
          city: r.city || countyInfo.city,
          state: 'GA',
          filing_date: n.filingDate,
          filing_type: 'Notice of Foreclosure Sale',
          notice_id: n.noticeId
        });
      });
      console.log('Batch ' + (Math.floor(i / 3) + 1) + ': ' + results.filter(function(r) { return r.address; }).length + '/' + batch.length + ' got addresses');
    }

    await browser.close();
    var withAddr = leads.filter(function(l) { return l.property_address; }).length;
    console.log('GA done: ' + leads.length + ' leads, ' + withAddr + ' with addresses for ' + targetCounty + ' County');
    return leads.slice(0, maxLeads);

  } catch(e) {
    try { await browser.close(); } catch(e2) {}
    throw new Error('GA scraping failed: ' + e.message);
  }
}

async function scrapeViaBot(countyInfo, maxLeads, leadTypes) {
  const ltl = { nod: 'Notice of Default', lis_pendens: 'Lis Pendens', nts: 'Notice of Trustee Sale' };
  const leadStr = (leadTypes || ['nod','lis_pendens','nts']).map(function(t) { return ltl[t] || t; }).join(', ');
  console.log('Delegating to OpenClaw: ' + countyInfo.county_name + ', ' + countyInfo.state_abbr);
  const prompt = 'Pull up to ' + maxLeads + ' pre-foreclosure leads from ' + countyInfo.county_name + ', ' + countyInfo.state_name + ' (' + countyInfo.state_abbr + ', FIPS: ' + countyInfo.fips + ').\n\nLead types: ' + leadStr + '. Filings from last 90 days.\n\nReturn ONLY a raw JSON array:\n[{"owner_name":"Full Name","property_address":"123 Main St","city":"' + countyInfo.city + '","state":"' + countyInfo.state_abbr + '","filing_date":"YYYY-MM-DD","filing_type":"Notice of Default","case_number":"2024-12345"}]\n\nIf no results, return: []';
  const content = await callOpenClaw(prompt, 8000, 420000);
  const jm = content.match(/\[[\s\S]*\]/);
  if (!jm) { console.log('Bot no JSON for ' + countyInfo.state_abbr); return []; }
  const leads = JSON.parse(jm[0]);
  console.log('Bot scraped ' + leads.length + ' leads for ' + countyInfo.state_abbr);
  return leads;
}

// ── Async job runner ───────────────────────────────────────────────────────────
// Called by /enrich/start — runs pipeline in background, stores result in jobStore

async function runEnrichJob(jobId, zip, count, leadTypes) {
  try {
    const ci = await zipToCounty(zip);
    jobStore.set(jobId, { status: 'scraping', county: ci, startedAt: Date.now() });
    console.log('[Job ' + jobId + '] Pipeline: ' + zip + ' -> ' + ci.county_name);
    const leads = ci.state_abbr === 'GA' ? await scrapeGeorgia(ci, count) : await scrapeViaBot(ci, count, leadTypes);
    const valid = leads.filter(function(l) {
      const a = (l.property_address || '').trim();
      return a.length >= 8 && a.length <= 200 && /\d/.test(a);
    });
    console.log('[Job ' + jobId + '] Valid addresses: ' + valid.length + '/' + leads.length);
    jobStore.set(jobId, { status: 'tracing', county: ci, startedAt: jobStore.get(jobId).startedAt });
    var downloadUrl = null;
    if (valid.length > 0) {
      downloadUrl = await batchTrace(valid);
    }
    jobStore.set(jobId, { status: 'complete', county: ci, lead_count: valid.length, raw_lead_count: leads.length, tracerfy_download: downloadUrl, startedAt: jobStore.get(jobId).startedAt, completedAt: Date.now() });
    console.log('[Job ' + jobId + '] Done: ' + valid.length + ' leads with addresses');
  } catch(e) {
    console.error('[Job ' + jobId + '] Error:', e.message);
    jobStore.set(jobId, { status: 'failed', error: e.message, startedAt: (jobStore.get(jobId) || {}).startedAt });
  }
}

// Routes
app.get('/health', function(req, res) { res.json({ status: 'ok', version: '3.1.0', twocaptcha: 'enabled', async_jobs: true }); });

// Start async enrich job — returns immediately with jobId
app.get('/enrich/start', async function(req, res) {
  const zip = req.query.zip, count = parseInt(req.query.count || '50');
  const leadTypes = req.query.lead_types ? req.query.lead_types.split(',') : ['nod','lis_pendens','nts'];
  if (!zip) return res.status(400).json({ error: 'zip required' });
  const jobId = String(++jobCounter) + '_' + Date.now();
  jobStore.set(jobId, { status: 'queued', startedAt: Date.now() });
  // Fire and forget
  runEnrichJob(jobId, zip, count, leadTypes).catch(function(e) { console.error('runEnrichJob unhandled:', e.message); });
  res.json({ jobId: jobId });
});

// Poll job status
app.get('/enrich/status/:jobId', function(req, res) {
  var job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.post('/ai/brief', async function(req, res) {
  const { county, state, leadTypes, count, propertyType } = req.body;
  const ll = { nod: 'Notice of Default', lis_pendens: 'Lis Pendens', nts: 'Notice of Trustee Sale' };
  const leadStr = (leadTypes || []).map(function(t) { return ll[t] || t; }).join(', ');
  const propStr = propertyType === 'sfr' ? 'single-family homes' : propertyType === 'multi' ? 'multi-family' : 'all property types';
  const prompt = 'You are Commander, the AI engine for Real Deal Wholesale. Order: ' + count + ' ' + leadStr + ' leads from ' + county + ', ' + state + '. Filtering for ' + propStr + '.\n\nWrite 2-3 sentences: confirm you are on it, reference the specific county and state, include one market insight, say the list will be ready in ~2 hours. No fluff, no bullets.';
  try { res.json({ message: await callOpenClaw(prompt, 200, 30000) || 'On it. Your leads will be ready in ~2 hours.' }); }
  catch(e) { res.json({ message: 'On it. Pulling ' + count + ' leads from ' + county + ', ' + state + '. Skip-traced list ready in ~2 hours.' }); }
});

app.get('/leads', async function(req, res) {
  const zip = req.query.zip, count = parseInt(req.query.count || '50');
  const leadTypes = req.query.lead_types ? req.query.lead_types.split(',') : ['nod','lis_pendens','nts'];
  if (!zip) return res.status(400).json({ error: 'zip required' });
  try {
    const ci = await zipToCounty(zip);
    console.log('Scraping ' + zip + ' -> ' + ci.county_name + ', ' + ci.state_abbr);
    const leads = ci.state_abbr === 'GA' ? await scrapeGeorgia(ci, count) : await scrapeViaBot(ci, count, leadTypes);
    res.json({ zip, county: ci, lead_count: leads.length, leads });
  } catch(e) { console.error(e.message); res.status(500).json({ error: e.message }); }
});

app.get('/leads/enrich', async function(req, res) {
  const zip = req.query.zip, count = parseInt(req.query.count || '50');
  const leadTypes = req.query.lead_types ? req.query.lead_types.split(',') : ['nod','lis_pendens','nts'];
  if (!zip) return res.status(400).json({ error: 'zip required' });
  try {
    const ci = await zipToCounty(zip);
    console.log('Pipeline: ' + zip + ' -> ' + ci.county_name);
    const leads = ci.state_abbr === 'GA' ? await scrapeGeorgia(ci, count) : await scrapeViaBot(ci, count, leadTypes);
    const valid = leads.filter(function(l) {
      const a = (l.property_address || '').trim();
      return a.length >= 8 && a.length <= 200 && /\d/.test(a);
    });
    console.log('Valid addresses: ' + valid.length + '/' + leads.length);
    if (valid.length === 0) return res.json({ zip, county: ci, lead_count: 0, raw_leads: leads, tracerfy_download: null, message: 'No valid addresses for skip tracing' });
    const downloadUrl = await batchTrace(valid);
    res.json({ zip, county: ci, lead_count: valid.length, raw_leads: leads, tracerfy_download: downloadUrl });
  } catch(e) { console.error(e.message); res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, function() { console.log('APEX Scraper v3.0 on port ' + PORT + ' - 2Captcha enabled for GA'); });
