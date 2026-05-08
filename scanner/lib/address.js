// Address normalization + fuzzy matching against the properties table.
// Mirrors the normalization done by the data-loader so both sides line up.
import { supabase } from './supabase.js';

// Normalize a street/city/zip address for fuzzy matching.
// Lowercase, expand abbreviations, strip punctuation, collapse whitespace.
export function normalizeAddress(raw) {
  if (!raw) return null;
  let s = String(raw).toLowerCase().trim();

  // Strip apartment/unit/suite suffixes
  s = s.replace(/\b(apt|unit|suite|ste|#)\s*[\w-]+/g, '');

  const abbrs = {
    '\\bst\\b': 'street', '\\bave\\b': 'avenue', '\\brd\\b': 'road',
    '\\bdr\\b': 'drive', '\\bln\\b': 'lane', '\\bct\\b': 'court',
    '\\bblvd\\b': 'boulevard', '\\bpl\\b': 'place', '\\bter\\b': 'terrace',
    '\\bcir\\b': 'circle', '\\bpkwy\\b': 'parkway', '\\bhwy\\b': 'highway',
    '\\bn\\b': 'north', '\\bs\\b': 'south', '\\be\\b': 'east', '\\bw\\b': 'west',
  };
  for (const [pattern, replacement] of Object.entries(abbrs)) {
    s = s.replace(new RegExp(pattern, 'g'), replacement);
  }
  s = s.replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim();
  return s || null;
}

/**
 * Fuzzy-match a parsed address against the properties table.
 *
 * @param {object} parsed - { street, city, zip } - any subset
 * @returns {Promise<{ propertyId: string|null, confidence: number, matchedAddress: string|null }>}
 */
export async function matchPropertyByAddress({ street, city, zip }) {
  if (!street) return { propertyId: null, confidence: 0, matchedAddress: null };

  const normalized = normalizeAddress(`${street} ${city || ''} ${zip || ''}`);
  if (!normalized) return { propertyId: null, confidence: 0, matchedAddress: null };

  // Use Postgres similarity() via a SQL RPC. We use a direct SQL query through
  // an RPC because the JS client doesn't expose pg_trgm operators.
  // Fall back to a less-precise like-match if the trigram query is too slow.
  const { data, error } = await supabase
    .rpc('match_property_address', { addr: normalized, limit_n: 1 });

  if (error) {
    // RPC not yet defined — fall back to client-side similarity scan
    return await fallbackMatch(normalized);
  }
  if (!data || data.length === 0) return { propertyId: null, confidence: 0, matchedAddress: null };

  return {
    propertyId: data[0].id,
    confidence: data[0].sim,
    matchedAddress: data[0].full_address,
  };
}

// Fallback when RPC isn't available — narrow by ZIP and rank by trigram client-side.
async function fallbackMatch(normalized) {
  // Pull ZIP from normalized string if present
  const zipMatch = normalized.match(/\b(\d{5})\b/);
  const zip = zipMatch ? zipMatch[1] : null;

  let query = supabase
    .from('properties')
    .select('id, full_address, zip')
    .limit(50);

  if (zip) query = query.eq('zip', zip);

  const { data, error } = await query;
  if (error || !data || data.length === 0) {
    return { propertyId: null, confidence: 0, matchedAddress: null };
  }

  // Score each candidate by token overlap (poor man's fuzzy match)
  const targetTokens = new Set(normalized.split(/\s+/));
  let best = { propertyId: null, confidence: 0, matchedAddress: null };
  for (const row of data) {
    const candTokens = new Set((row.full_address || '').split(/\s+/));
    const inter = [...targetTokens].filter(t => candTokens.has(t)).length;
    const union = new Set([...targetTokens, ...candTokens]).size;
    const score = union > 0 ? inter / union : 0;
    if (score > best.confidence) {
      best = { propertyId: row.id, confidence: score, matchedAddress: row.full_address };
    }
  }
  return best;
}
