// MA Secretary of State business entity enrichment.
// For each LLC/Trust property owner without a fresh SOS lookup, scrape
// the corp.sec.state.ma.us search and detail page to find:
//   - Registered agent (legal contact)
//   - Manager(s) / officer(s) (the humans controlling the entity)
//   - Mailing + business addresses
//
// Run:  node registries/ma_sos.js                  (process up to 200 entities)
//       node registries/ma_sos.js --only=LMDE16    (single entity test)
//       node registries/ma_sos.js --refresh        (re-fetch even if cached)

import 'dotenv/config';
import { chromium } from 'playwright';
import { supabase } from '../lib/supabase.js';

const SEARCH_URL = 'https://corp.sec.state.ma.us/CorpWeb/CorpSearch/CorpSearch.aspx';

const args = process.argv.slice(2);
const onlyArg = args.find(a => a.startsWith('--only='));
const refresh = args.includes('--refresh');
const onlyEntity = onlyArg ? onlyArg.split('=')[1] : null;
const LIMIT = 200;

// ── Helpers ────────────────────────────────────────────────────────────────

function isEntity(name) {
  return !!name && /\b(llc|l\.l\.c\.|inc|inc\.|incorporated|corp|corporation|company|co\.|trust|trustees|trustee|partners|partnership|limited|ltd|associates|holdings|properties|realty|estates|management|capital|investments|fund|group|enterprises)\b/i.test(name);
}

function extractContactPerson(text) {
  if (!text) return null;
  // Common patterns: "C/O JT MAGEN & CO. INC., ATTN: RUSSELL GIOIELLA 44 WEST..."
  // Stop on digit (street number), street word, comma, or newline
  const stop = /(?=\s+(?:\d|STREET|ST\b|AVE|AVENUE|ROAD|RD\b|BLVD|BOULEVARD|DR\b|DRIVE|LANE|LN\b|COURT|CT\b|PLACE|PL\b|WAY|HIGHWAY|HWY)|\s*[,\n]|$)/i;
  let m = text.match(new RegExp(`ATTN:?\\s*([A-Z][A-Za-z'\\-\\.\\s]+?)${stop.source}`, 'i'));
  if (m) return m[1].trim();
  m = text.match(new RegExp(`C\\/O\\s+([A-Z][A-Za-z'\\-\\.\\s&]+?)${stop.source}`, 'i'));
  if (m) return m[1].trim();
  return null;
}

// ── Get LLC/Trust property owners that need a SOS lookup ──────────────────

async function getEntitiesToFetch() {
  // Pull all distinct owners that look like entities and don't have a record
  // (or need a refresh). Prefer entities tied to leads first.
  const { data } = await supabase
    .from('properties')
    .select('owner_name')
    .not('owner_name', 'is', null);

  const seen = new Set();
  const entityNames = [];
  for (const row of data || []) {
    const n = (row.owner_name || '').trim();
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    if (isEntity(n)) entityNames.push(n);
  }

  // Filter to those with leads (most relevant) first
  const { data: leadOwners } = await supabase
    .from('leads')
    .select('properties(owner_name)')
    .order('score', { ascending: false });
  const leadOwnerSet = new Set((leadOwners || []).map((l) => l.properties?.owner_name).filter(Boolean));

  // Skip already-cached unless --refresh
  if (!refresh) {
    const { data: cached } = await supabase
      .from('entity_records')
      .select('entity_name');
    const cachedSet = new Set((cached || []).map(r => r.entity_name.toLowerCase()));
    const filtered = entityNames.filter(n => !cachedSet.has(n.toLowerCase()));
    // Sort: entities tied to leads first
    filtered.sort((a, b) => {
      const aHas = leadOwnerSet.has(a) ? 0 : 1;
      const bHas = leadOwnerSet.has(b) ? 0 : 1;
      return aHas - bHas;
    });
    return filtered;
  }
  return entityNames;
}

// ── Fetch one entity from MA SOS ──────────────────────────────────────────

async function fetchEntity(page, entityName) {
  console.log(`\n🔍 ${entityName}`);
  await page.goto(SEARCH_URL, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(800);

  await page.fill('#MainContent_txtEntityName', entityName);
  // "Begins with" radio is default — that's what we want for exact-prefix match
  await page.click('#MainContent_btnSearch');
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const searchText = await page.evaluate(() => document.body.innerText);

  // Parse from rendered text. Pattern after "Entity Name ID Number Old ID Number Address":
  //   <ENTITY NAME>  <SOS_ID>  [<OLD_ID>]  <ADDRESS_LINES>
  // Tab-separated. Look for our entity name as start of a line.
  const lines = searchText.split('\n').map(l => l.trimEnd());
  let sosId = null;
  let addressBlock = '';
  let dataRowIdx = -1;
  const targetUpper = entityName.toUpperCase().trim();

  for (let i = 0; i < lines.length; i++) {
    const lineUpper = lines[i].toUpperCase().trimStart();
    if (lineUpper.startsWith(targetUpper) && i + 1 < lines.length) {
      // The data row contains tabs. Split by tab.
      const parts = lines[i].split(/\t+/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2 && parts[0].toUpperCase().startsWith(targetUpper)) {
        sosId = parts[1] || null;
        addressBlock = parts.slice(2).filter(p => !/^$/.test(p)).join(' ').trim();
        dataRowIdx = i;
        // Address might continue on next lines (no leading tabs)
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const cont = lines[j].trim();
          if (!cont || /^(William Francis|Secretary|One Ashburton|\d{3}-\d{3}|cis@)/.test(cont)) break;
          addressBlock += ' ' + cont;
        }
        break;
      }
    }
  }

  if (dataRowIdx === -1) {
    return {
      entity_name: entityName,
      raw_search_text: searchText,
      fetch_error: 'not_found',
    };
  }

  const contactPerson = extractContactPerson(addressBlock);

  // Try to click into the entity's detail page for managers/registered agent
  let detailText = null;
  let registeredAgent = null;
  let managers = [];
  try {
    // The entity name itself is the link in the search results
    const link = await page.$(`a:text-is("${entityName}"), a:has-text("${entityName.split(' ')[0]}")`);
    if (link) {
      await link.click();
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      detailText = await page.evaluate(() => document.body.innerText);

      // Parse registered agent + managers from detail page
      const agentMatch = detailText.match(/(?:Registered\s+Agent|Resident\s+Agent)\s*\n?\s*Name\s*\n?\s*([A-Z][A-Za-z'\-\.\s,&]+?)(?:\n|Address)/i);
      if (agentMatch) registeredAgent = agentMatch[1].trim();

      // Officer/manager table parsing — find rows with title + name
      const offMatches = [...detailText.matchAll(/(MANAGER|PRESIDENT|TREASURER|SECRETARY|DIRECTOR|MEMBER|OFFICER|TRUSTEE)\s*\n?\s*([A-Z][A-Za-z'\-\.\s,]+?)\s*\n/g)];
      for (const m of offMatches) {
        managers.push({ title: m[1].trim(), name: m[2].trim() });
      }
    }
  } catch (e) {
    // detail click failed — continue with search data
  }

  return {
    entity_name: entityName,
    sos_id: sosId,
    mailing_address: addressBlock || null,
    contact_person: contactPerson,
    registered_agent: registeredAgent,
    managers: managers.length ? managers : null,
    raw_search_text: searchText,
    raw_detail_text: detailText,
    fetch_error: null,   // explicit clear for upsert
    fetched_at: new Date().toISOString(),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  let entities;
  if (onlyEntity) {
    entities = [onlyEntity];
  } else {
    entities = (await getEntitiesToFetch()).slice(0, LIMIT);
  }

  console.log(`📋 ${entities.length} entities to fetch (limit ${LIMIT})\n`);

  let processed = 0;
  let found = 0;
  let errors = 0;

  for (const name of entities) {
    try {
      const rec = await fetchEntity(page, name);
      processed++;

      if (rec.fetch_error) {
        console.log(`   ⚠️ ${name} → ${rec.fetch_error}`);
        errors++;
      } else {
        const summary = [
          rec.contact_person && `Contact: ${rec.contact_person}`,
          rec.registered_agent && `Agent: ${rec.registered_agent}`,
          rec.managers?.length && `${rec.managers.length} managers`,
        ].filter(Boolean).join(' | ');
        console.log(`   ✓ ${name} → ${summary || 'cached'}`);
        found++;
      }

      // Upsert
      await supabase.from('entity_records').upsert(rec, { onConflict: 'entity_name' });
      await page.waitForTimeout(700); // be polite
    } catch (err) {
      console.error(`   ❌ ${name} → ${err.message}`);
      errors++;
    }
  }

  console.log(`\n✅ Done.`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Found:     ${found}`);
  console.log(`   Errors:    ${errors}`);

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
