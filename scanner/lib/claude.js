// Claude Haiku address extractor.
// Takes raw text from a registry detail page and returns structured filing data.
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

const HAVE_KEY = !!process.env.ANTHROPIC_API_KEY;
const client = HAVE_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

const SYSTEM_PROMPT = `You are a parser for Massachusetts Registry of Deeds documents. \
Extract structured data from the raw page text. Always return ONLY a single JSON object, no markdown, no explanation.

Schema:
{
  "grantor": "primary grantor (debtor / property owner being acted against)",
  "grantee": "primary grantee (lien holder / petitioner)",
  "property_address": "street address only, no city/state/zip",
  "city": "MA city or town",
  "zip": "5-digit zip if present, else null",
  "filing_date": "YYYY-MM-DD if present, else null",
  "doc_type_specific": "specific subtype like 'Notice of Contract' or 'Tax Lien' or 'Lis Pendens'",
  "is_mechanics_lien": true|false,
  "summary": "one sentence describing what this filing is",
  "confidence": 0.0-1.0
}

Rules:
- For TAX LIEN docs: grantor = property owner, grantee = government taxing entity.
- For LIS PENDENS: grantor = defendant property owner, grantee = plaintiff (often a bank).
- For NOTICE: check if it's a "Notice of Contract" under M.G.L. c. 254 (mechanic's lien). Set is_mechanics_lien=true if so.
- If you cannot find a property address, set property_address=null and confidence=0.
- Output ONLY the JSON object. No prose.`;

export async function extractFiling(rawText) {
  if (!HAVE_KEY) {
    return naiveFallback(rawText);
  }

  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: rawText.slice(0, 8000) }],
    });
    const text = resp.content?.[0]?.text || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No JSON in response');
    return JSON.parse(m[0]);
  } catch (err) {
    console.error('  ⚠️ Claude extract failed:', err.message);
    return naiveFallback(rawText);
  }
}

// No-AI fallback: best-effort regex extraction. Used when ANTHROPIC_API_KEY is not set
// or when Claude fails. Confidence is always low.
function naiveFallback(rawText) {
  const text = String(rawText || '');
  const addrMatch = text.match(/\b(\d{1,6}\s+[A-Z][A-Za-z0-9\s]+?(?:STREET|ST|AVENUE|AVE|ROAD|RD|DRIVE|DR|LANE|LN|COURT|CT|BOULEVARD|BLVD|PLACE|PL|TERRACE|TER|CIRCLE|CIR|WAY|HIGHWAY|HWY))\b/i);
  const zipMatch = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  const cityMatch = text.match(/\b(BOSTON|CAMBRIDGE|NEWTON|SOMERVILLE|MEDFORD|BROOKLINE|MILTON|WATERTOWN|WALTHAM|LEXINGTON|CONCORD|SUDBURY|WAYLAND|WINCHESTER|LINCOLN|WESTON|CARLISLE|WELLESLEY|NEEDHAM|DOVER|WESTWOOD|HINGHAM|COHASSET|SCITUATE|DUXBURY|MARBLEHEAD|MANCHESTER)\b/i);
  return {
    grantor: null,
    grantee: null,
    property_address: addrMatch ? addrMatch[1] : null,
    city: cityMatch ? cityMatch[1] : null,
    zip: zipMatch ? zipMatch[1] : null,
    filing_date: null,
    doc_type_specific: null,
    is_mechanics_lien: false,
    summary: 'fallback regex extraction',
    confidence: addrMatch ? 0.3 : 0,
  };
}
