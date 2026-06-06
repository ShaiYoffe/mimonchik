// Extra-check saturation gate — copies the working phone-history pattern from
// leads.ymedia.co.il (the lead-qualifier project at
// ~/Documents/claude/lead-qualifier/src/app/api/leads/phone-history/route.ts).
//
// CRITICAL — the working Leadim endpoint for "which advertisers ever received
// this phone?" is `leads_get.ashx?by_phone=X` (not leads_search.ashx).
// leads_search.ashx silently ignores by_phone — it returns the global lead
// count for the advertiser. leads_get.ashx actually honors by_phone and
// returns every lead matching the phone, each containing
// routes_to_advertisers[] and adv_users[] arrays.
//
// Per user spec (latest revision 2026-06-06):
//   LOCATE button (lm_form=118412):
//     44548 + 33995 are LINKED advertisers (treat as one slot — a lead
//     routed to either cannot also be routed to the other). Hide ONLY when
//     (44548 OR 33995) AND 44089 already routed.
//   GRANT  button (lm_form=118413):
//     Hide if ANY of {44548, 53705, 33995} already routed.
// Fail-open on every error path — never penalize the user for an API hiccup.

const LEADIM_BASE_URL = 'https://proxy.leadim.xyz/apiproxy/5517/api';
// Read token — leads_get.ashx requires this dedicated search token (the write
// token used by lib/leadim.js does NOT have read permissions).
const LEADIM_AUTH = process.env.LEADIM_SEARCH_TOKEN || 'U-7CE3E2A312094428.9D1B8F29415E3A83';

// Advertiser user-IDs (Leadim "user" / advertiser IDs)
const ADV_44548 = 44548;   // אלדר איתור כספים — gates grant + half of locate's linked slot
const ADV_44089 = 44089;   // ליאור אלהרר — the other locate slot
const ADV_53705 = 53705;   // אלדר מענק עבודה — grant-only
const ADV_33995 = 33995;   // linked with 44548 for locate; also gates grant

const ALLOWED_ORIGINS = [
  'https://calmimon.com',
  'https://www.calmimon.com',
];

const FETCH_TIMEOUT_MS = 4500;

// Send both 0xx and 972 variants — Leadim stores phones inconsistently
// depending on the upstream form (some forms normalize to local, some to
// international).
function phoneVariants(raw) {
  if (!raw) return [];
  const digits = String(raw).replace(/\D/g, '');
  const variants = new Set();
  if (digits.length === 10 && digits.startsWith('0')) {
    variants.add(digits);
    variants.add('972' + digits.slice(1));
  } else if (digits.length === 9 && digits.startsWith('5')) {
    variants.add('0' + digits);
    variants.add('972' + digits);
  } else if (digits.length === 12 && digits.startsWith('972')) {
    variants.add(digits);
    variants.add('0' + digits.slice(3));
  }
  return [...variants];
}

async function fetchWithTimeout(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(tid);
  }
}

// Returns a Set of advertiser IDs that have EVER received any lead with the
// given phone (across all of Leadim's history). On error returns null →
// caller treats null as "no data — fail-open".
async function getRoutedAdvertiserIds(phone) {
  try {
    const url = `${LEADIM_BASE_URL}/leads_get.ashx?by_phone=${encodeURIComponent(phone)}`;
    const res = await fetchWithTimeout(
      url,
      { method: 'GET', headers: { 'X-LEAD-IM-AUTH': LEADIM_AUTH } },
      FETCH_TIMEOUT_MS,
    );
    const j = await res.json();
    if (!j || j.status !== 'success' || !Array.isArray(j.data)) return null;
    const ids = new Set();
    for (const lead of j.data) {
      const routes = Array.isArray(lead.routes_to_advertisers) ? lead.routes_to_advertisers : [];
      const advs   = Array.isArray(lead.adv_users) ? lead.adv_users : [];
      for (const r of routes) {
        if (typeof r === 'number') ids.add(r);
      }
      for (const a of advs) {
        if (a && typeof a.id === 'number') ids.add(a.id);
      }
    }
    return ids;
  } catch (e) {
    console.error('[check-extra-saturation] leads_get failed:', phone, e && e.message);
    return null;
  }
}

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin) || origin === '') {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  // Body parsing
  let body;
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch (e) {
    return res.status(400).json({ success: false, error: 'Bad request' });
  }

  const variants = phoneVariants(body.phone);
  if (variants.length === 0) {
    return res.status(200).json({
      success: true,
      locate_available: true,
      grant_available: true,
      reason: 'no_valid_phone — fail-open',
    });
  }

  try {
    // Query each phone variant in parallel — union the routed advertiser IDs.
    const idsByVariant = await Promise.all(variants.map(getRoutedAdvertiserIds));
    // If ALL variants errored, fail-open
    if (idsByVariant.every(s => s === null)) {
      return res.status(200).json({
        success: true,
        locate_available: true,
        grant_available: true,
        reason: 'leadim_all_variants_failed — fail-open',
      });
    }
    const allIds = new Set();
    for (const s of idsByVariant) {
      if (s) for (const id of s) allIds.add(id);
    }

    const got_44548 = allIds.has(ADV_44548);
    const got_44089 = allIds.has(ADV_44089);
    const got_53705 = allIds.has(ADV_53705);
    const got_33995 = allIds.has(ADV_33995);

    // LOCATE: 44548 + 33995 are LINKED — a lead routed to either occupies
    // the "44548 slot". So we need (44548 OR 33995) AND 44089 to hide.
    const locateSlotA = (got_44548 || got_33995);
    const locate_available = !(locateSlotA && got_44089);
    // GRANT: hide if ANY of 44548 / 53705 / 33995 already received
    const grant_available  = !(got_44548 || got_53705 || got_33995);

    return res.status(200).json({
      success: true,
      locate_available,
      grant_available,
      debug: {
        phoneVariants: variants,
        allRoutedAdvertiserIds: [...allIds].sort((a, b) => a - b),
        targets: { '44548': got_44548, '44089': got_44089, '53705': got_53705, '33995': got_33995 },
        locate_slot_a_linked_44548_or_33995: locateSlotA,
      },
    });
  } catch (e) {
    console.error('[check-extra-saturation] error:', e && e.message);
    return res.status(200).json({
      success: true,
      locate_available: true,
      grant_available: true,
      reason: 'upstream_error — fail-open',
      error: String(e && e.message || e),
    });
  }
}
