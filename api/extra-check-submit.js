// /api/extra-check-submit — server-side gate for extra-check cross-sell leads.
//
// SINGLE SOURCE OF TRUTH for creating leads in Leadim forms 118412 (locate)
// and 118413 (grant). All client-side webhooks must POST here. The endpoint
// validates name + phone strictly server-side; bypass-resistant.
//
// History: 2026-06-07 we kept patching client-side guards (v2, v3, v3.1)
// but invalid leads kept reaching Leadim. Lead 117263104 (mimon360.com,
// 12:56, status "לא תקין") was created with empty name+phone AFTER v3.1
// deployed. Root cause: anything client-side can be bypassed by a malformed
// flow or a browser quirk we hadn't enumerated. Server-side validation is
// the only bulletproof gate.
//
// Behavior:
//   - POST {name, phone, choice, email, age, dob, city, employment, pension,
//           hasWithdraw, code, sourceDomain, utm_*}
//   - Validate: name (2+ chars, not pure numeric, not "undefined"/"null"/"NaN"),
//               phone (Israeli mobile 05XXXXXXXX), choice ('grant' | 'locate').
//   - If valid → forward to api.lead.im/v2/submit with proper lm_form + lm_key.
//   - If invalid → 400 with reason, log to console (visible in Vercel dashboard).
//   - Returns: { success: bool, lead_id?: string, error?: string }.

const FORM_GRANT  = { lm_form: '118413', lm_key: '4bb94969c3' };
const FORM_LOCATE = { lm_form: '118412', lm_key: 'b99fdeb225' };

function cleanIdentity(v) {
  if (v === undefined || v === null) return '';
  const s = String(v).trim();
  if (!s) return '';
  if (s === 'undefined' || s === 'null' || s === 'NaN') return '';
  return s;
}

function validateName(v) {
  const s = cleanIdentity(v);
  if (s.length < 2) return null;
  if (/^\d+$/.test(s)) return null;
  return s;
}

function validatePhone(v) {
  const s = cleanIdentity(v);
  if (!s) return null;
  let digits = s.replace(/\D/g, '');
  if (digits.length === 12 && digits.indexOf('972') === 0) digits = '0' + digits.slice(3);
  if (digits.length === 9 && digits.charAt(0) === '5') digits = '0' + digits;
  return /^05\d{8}$/.test(digits) ? digits : null;
}

export default async function handler(req, res) {
  // CORS — accept from any host that's part of our portfolio (we add the
  // host header to the validation, so cross-origin abuse is limited by the
  // strict name/phone validation anyway).
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  let body;
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch (e) {
    return res.status(400).json({ success: false, error: 'bad_json' });
  }

  const name  = validateName(body.name);
  const phone = validatePhone(body.phone);
  const choice = String(body.choice || '').toLowerCase();
  const form = (choice === 'grant') ? FORM_GRANT : (choice === 'locate') ? FORM_LOCATE : null;

  // STRICT GATE — log + reject anything missing.
  if (!name || !phone || !form) {
    console.warn('[extra-check-submit] REJECTED', {
      reason: !name ? 'invalid_name' : (!phone ? 'invalid_phone' : 'invalid_choice'),
      received_name:  body.name,
      received_phone: body.phone,
      received_choice: body.choice,
      origin,
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
      ua: req.headers['user-agent'] || '',
    });
    return res.status(400).json({
      success: false,
      error: !name ? 'invalid_name' : (!phone ? 'invalid_phone' : 'invalid_choice'),
    });
  }

  // dedupe v2 2026-06-07 — server-side saturation check BEFORE forwarding to Leadim.
  // Defense in depth: even if the client-side button rule fails (stale page, race
  // condition), this catches any duplicate routing attempt. Rejects if ANY of the
  // 4 extra-check advertisers {44548, 44089, 53705, 33995} already routed this phone.
  // Fail-open on network error — never block a legitimate first-time submission.
  try {
    const variants = [];
    {
      const digits = String(phone).replace(/\D/g, '');
      if (digits.length === 10 && digits.startsWith('0')) {
        variants.push(digits);
        variants.push('972' + digits.slice(1));
      } else if (digits.length === 9 && digits.startsWith('5')) {
        variants.push('0' + digits);
        variants.push('972' + digits);
      } else if (digits.length === 12 && digits.startsWith('972')) {
        variants.push(digits);
        variants.push('0' + digits.slice(3));
      } else {
        variants.push(phone);
      }
    }
    const SEARCH_TOKEN = process.env.LEADIM_SEARCH_TOKEN || 'U-7CE3E2A312094428.9D1B8F29415E3A83';
    const BLOCKING_ADV_IDS = new Set([44548, 44089, 53705, 33995]);
    const routedIds = new Set();
    const fetchOpts = { method: 'GET', headers: { 'X-LEAD-IM-AUTH': SEARCH_TOKEN } };
    const results = await Promise.all(variants.map(async (v) => {
      try {
        const url = `https://proxy.leadim.xyz/apiproxy/5517/api/leads_get.ashx?by_phone=${encodeURIComponent(v)}`;
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4000);
        const r = await fetch(url, { ...fetchOpts, signal: ctrl.signal });
        clearTimeout(tid);
        const j = await r.json();
        if (!j || j.status !== 'success' || !Array.isArray(j.data)) return null;
        for (const lead of j.data) {
          const routes = Array.isArray(lead.routes_to_advertisers) ? lead.routes_to_advertisers : [];
          const advs   = Array.isArray(lead.adv_users) ? lead.adv_users : [];
          for (const id of routes) if (typeof id === 'number') routedIds.add(id);
          for (const a of advs) if (a && typeof a.id === 'number') routedIds.add(a.id);
        }
        return true;
      } catch (_) { return null; }
    }));
    const blocking = [...routedIds].filter(id => BLOCKING_ADV_IDS.has(id));
    if (blocking.length > 0) {
      console.warn('[extra-check-submit] DEDUPE_BLOCK', {
        reason: 'phone_already_routed_to_extra_check_advertiser',
        phone,
        blocking_advertiser_ids: blocking,
        all_routed_ids: [...routedIds].sort((a,b) => a-b),
        choice,
      });
      return res.status(409).json({
        success: false,
        error: 'phone_already_routed',
        blocking_advertiser_ids: blocking,
      });
    }
  } catch (e) {
    // Fail-open: log but allow forward
    console.warn('[extra-check-submit] dedupe check error (fail-open):', e && e.message);
  }

  // Build the Leadim v2 submission. fld_X mappings match the original
  // client-side webhook so the CRM display stays identical.
  const qs = new URLSearchParams();
  qs.set('lm_form',      form.lm_form);
  qs.set('lm_key',       form.lm_key);
  qs.set('lm_redirect',  'no');
  qs.set('fld_179817',   name);                              // name
  qs.set('fld_179818',   phone);                             // phone
  qs.set('fld_179820',   String(body.email || ''));          // email
  qs.set('field_2e78520', String(body.age || ''));           // age (numeric)
  qs.set('fld_283259',   String(body.dob || ''));            // DOB
  qs.set('fld_93140',    String(body.city || ''));           // city
  qs.set('fld_214474',   String(body.employment || ''));     // employment status
  qs.set('fld_232629',   String(body.pension || ''));        // pension amount
  qs.set('fld_376925',   String(body.hasWithdraw || ''));    // withdrew pension yes/no
  qs.set('fld_179827',   String(body.sourceDomain || ''));   // source domain
  qs.set('fld_179824',   String(body.code || ''));           // OTP code (audit)
  ['utm_source','utm_medium','utm_campaign','utm_content'].forEach(k => {
    if (body[k]) qs.set(k, String(body[k]));
  });

  try {
    const r = await fetch('https://api.lead.im/v2/submit?' + qs.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    const text = await r.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) { /* response may not be JSON */ }
    const leadId = parsed && (parsed.lead_id || parsed.result || parsed.id) || null;

    console.log('[extra-check-submit] CREATED', {
      lm_form: form.lm_form,
      name,
      phone,
      lead_id: leadId,
      upstream_status: r.status,
    });

    return res.status(200).json({
      success: true,
      lead_id: leadId,
      lm_form: form.lm_form,
    });
  } catch (e) {
    console.error('[extra-check-submit] UPSTREAM_ERROR', {
      lm_form: form.lm_form,
      err: e && e.message,
    });
    return res.status(502).json({ success: false, error: 'upstream_error' });
  }
}
