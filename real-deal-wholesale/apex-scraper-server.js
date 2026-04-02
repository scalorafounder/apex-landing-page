const express = require('express');
const https = require('https');
const http = require('http');
const { chromium } = require('playwright');
const { parseNotice } = require('./parse');
const { batchTrace } = require('./tracerfy');

const app = express();
app.use(express.json());

// ── Helpers ────────────────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, res => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, body: data }));
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

// ── OpenClaw gateway ───────────────────────────────────────────────────────────

async function callOpenClaw(prompt, maxTokens, timeoutMs) {
  const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;
  const OPENCLAW_URL   = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18790';

  const res = await fetch(OPENCLAW_URL + '/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':        'application/json',
      'Authorization':       'Bearer ' + OPENCLAW_TOKEN,
      'x-openclaw-agent-id': 'commander',
    },
    body: JSON.stringify({
      model:      'openclaw',
      max_tokens: maxTokens || 300,
      messages:   [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs || 45000),
  });

  if (!res.ok) throw new Error('OpenClaw HTTP ' + res.status + ': ' + await res.text());
  const data = await res.json();
  return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
}

// ── Georgia scraper ────────────────────────────────────────────────────────────

async function scrapeGeorgiaPage(page, pageNum) {
  if (pageNum > 1) {
    try {
      const nextBtn = await page.$("a[href*='Page$" + pageNum + "']") || await page.$('a:has-text("' + pageNum + '")');
      if (!nextBtn) return null;
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
        nextBtn.click()
      ]);
    } catch(e) { return null; }
  }
  return await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('table tr').forEach((row, i) => {
      if (i === 0) return;
      const text = (row.innerText || '').trim();
      if (text.length > 50 && (text.includes('FORECLOSURE') || text.includes('Foreclosure')))
        results.push(text);
    });
    return results;
  });
}

async function scrapeGeorgia(countyInfo, maxLeads) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  try {
    await page.goto('https://www.georgiapublicnotice.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const sel = "select[name='ctl00$ContentPlaceHolder1$as1$ddlPopularSearches']";
    await page.waitForSelector(sel, { timeout: 10000 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.selectOption(sel, { label: 'Foreclosures' })
    ]);
    const ppSel = "select[name='ctl00$ContentPlaceHolder1$WSExtendedGridNP1$GridView1$ctl01$ddlPerPage']";
    if (await page.$(ppSel)) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
        page.selectOption(ppSel, '25')
      ]);
    }
    const seen = new Set(), leads = [];
    let pageNum = 1;
    while (leads.length < maxLeads) {
      console.log('Scraping GA page ' + pageNum + '...');
      const rawNotices = await scrapeGeorgiaPage(page, pageNum);
      if (!rawNotices || rawNotices.length === 0) break;
      for (const raw of rawNotices) {
        const parsed = parseNotice(raw);
        const key = parsed.noticeId || (parsed.ownerName + '|' + parsed.address);
        if (seen.has(key) || key === '|') continue;
        seen.add(key);
        if (parsed.ownerName || parsed.address) {
          leads.push({ owner_name: parsed.ownerName, property_address: parsed.address, county: parsed.county || countyInfo.county_name, city: countyInfo.city, state: 'GA', filing_date: parsed.filingDate, filing_type: 'Notice of Foreclosure Sale', notice_id: parsed.noticeId });
        }
      }
      pageNum++;
      if (pageNum > 20) break;
    }
    await browser.close();
    console.log('GA total: ' + leads.length + ' leads');
    return leads.slice(0, maxLeads);
  } catch(e) { await browser.close(); throw new Error('GA scraping failed: ' + e.message); }
}

// ── OpenClaw bot scraper (all other states) ────────────────────────────────────

async function scrapeViaBot(countyInfo, maxLeads, leadTypes) {
  const leadTypeLabels = { nod: 'Notice of Default', lis_pendens: 'Lis Pendens', nts: 'Notice of Trustee Sale' };
  const leadStr = (leadTypes || ['nod','lis_pendens','nts']).map(function(t) { return leadTypeLabels[t] || t; }).join(', ');

  console.log('Delegating ' + countyInfo.county_name + ', ' + countyInfo.state_abbr + ' to OpenClaw Commander...');

  const prompt = 'Pull up to ' + maxLeads + ' pre-foreclosure leads from ' + countyInfo.county_name + ', ' + countyInfo.state_name + ' (' + countyInfo.state_abbr + ', FIPS: ' + countyInfo.fips + ').\n\nLead types needed: ' + leadStr + '. Filings from the last 90 days.\n\nUse the Playwright browser to find the official county recorder, clerk of courts, or property appraiser website. Check known-counties.md first for a saved portal URL. Search for the relevant pre-foreclosure filings. Scrape all available records up to ' + maxLeads + '.\n\nReturn ONLY a raw JSON array (no markdown, no explanation, no code block) in exactly this format:\n[{"owner_name":"Full Name","property_address":"123 Main St","city":"' + countyInfo.city + '","state":"' + countyInfo.state_abbr + '","filing_date":"YYYY-MM-DD","filing_type":"Notice of Default","case_number":"2024-12345"}]\n\nIf no results found or site inaccessible, return: []';

  const content = await callOpenClaw(prompt, 8000, 420000);
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.log('Bot returned no JSON for ' + countyInfo.state_abbr + '. Response preview:', content.substring(0, 200));
    return [];
  }
  const leads = JSON.parse(jsonMatch[0]);
  console.log('Bot scraped ' + leads.length + ' leads for ' + countyInfo.state_abbr);
  return leads;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

app.get('/health', function(req, res) {
  res.json({ status: 'ok', version: '2.0.0', openclaw: 'connected', supports: 'all US counties' });
});

// POST /ai/brief — Commander generates market-specific response for the web app
app.post('/ai/brief', async function(req, res) {
  const { county, state, leadTypes, count, propertyType, contactReq } = req.body;
  const leadLabels = { nod: 'Notice of Default', lis_pendens: 'Lis Pendens', nts: 'Notice of Trustee Sale' };
  const leadStr    = (leadTypes || []).map(function(t) { return leadLabels[t] || t; }).join(', ');
  const propStr    = propertyType === 'sfr' ? 'single-family homes' : propertyType === 'multi' ? 'multi-family properties' : propertyType === 'commercial' ? 'commercial properties' : 'all property types';
  const contactStr = contactReq === 'both' ? 'phone + email on every lead' : contactReq === 'phone' ? 'phone numbers' : 'maximum contact coverage';

  const prompt = 'You are Commander, the AI engine for Real Deal Wholesale. A user just launched a lead pull.\n\nOrder: ' + count + ' ' + leadStr + ' leads from ' + county + ', ' + state + '. Filtering for ' + propStr + ' with ' + contactStr + '.\n\nWrite a 2-3 sentence response: confirm you are on it, reference the county and state specifically, include one sharp market insight for that location, and tell them their skip-traced list will be ready in approximately 2 hours. Speak with authority. No fluff, no bullet points, no headers. Pure signal.';

  try {
    const message = await callOpenClaw(prompt, 200, 30000);
    res.json({ message: message || 'On it. Your leads will be ready in about 2 hours.' });
  } catch(e) {
    console.error('AI brief error:', e.message);
    res.json({ message: 'On it. Pulling ' + count + ' ' + leadStr + ' leads from ' + county + ', ' + state + ' right now. Every lead will be skip-traced before delivery — come back in about 2 hours.' });
  }
});

// GET /leads — scrape only
app.get('/leads', async function(req, res) {
  const zip       = req.query.zip;
  const count     = parseInt(req.query.count || '50');
  const leadTypes = req.query.lead_types ? req.query.lead_types.split(',') : ['nod','lis_pendens','nts'];
  if (!zip) return res.status(400).json({ error: 'zip required' });
  try {
    const countyInfo = await zipToCounty(zip);
    console.log('Scraping ' + zip + ' -> ' + countyInfo.county_name + ', ' + countyInfo.state_abbr);
    const leads = countyInfo.state_abbr === 'GA'
      ? await scrapeGeorgia(countyInfo, count)
      : await scrapeViaBot(countyInfo, count, leadTypes);
    console.log('Returning ' + leads.length + ' leads');
    res.json({ zip, county: countyInfo, lead_count: leads.length, leads });
  } catch(e) { console.error(e.message); res.status(500).json({ error: e.message }); }
});

// GET /leads/enrich — scrape + skip trace
app.get('/leads/enrich', async function(req, res) {
  const zip       = req.query.zip;
  const count     = parseInt(req.query.count || '50');
  const leadTypes = req.query.lead_types ? req.query.lead_types.split(',') : ['nod','lis_pendens','nts'];
  if (!zip) return res.status(400).json({ error: 'zip required' });
  try {
    const countyInfo = await zipToCounty(zip);
    console.log('Full pipeline: ' + zip + ' -> ' + countyInfo.county_name);
    const leads = countyInfo.state_abbr === 'GA'
      ? await scrapeGeorgia(countyInfo, count)
      : await scrapeViaBot(countyInfo, count, leadTypes);
    console.log('Scraped ' + leads.length + ', skip tracing...');
    const leadsWithAddr = leads.filter(function(l) { return l.property_address; });
    if (leadsWithAddr.length === 0) {
      return res.json({ zip, county: countyInfo, lead_count: leads.length, raw_leads: leads, tracerfy_download: null, message: 'No parseable addresses for skip tracing' });
    }
    const downloadUrl = await batchTrace(leadsWithAddr);
    res.json({ zip, county: countyInfo, lead_count: leads.length, raw_leads: leads, tracerfy_download: downloadUrl });
  } catch(e) { console.error(e.message); res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, function() { console.log('APEX Scraper v2.0 on port ' + PORT + ' — OpenClaw connected for all US counties'); });
