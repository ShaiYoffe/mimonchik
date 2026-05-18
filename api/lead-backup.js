// /api/lead-backup — Captures form submissions to Supabase BEFORE Leadim,
// so leads survive Leadim outages. v3 — accepts lead_state from client.
//
// Security layers:
//   1. Origin allow-list   → only requests from our domains accepted
//   2. Honeypot field      → silent bot filter
//   3. Rate limit          → max 60 req/min per IP (in-memory LRU)
//   4. Server-side only    → BACKUP_SUPABASE_KEY is service_role,
//                            never exposed to the browser.
//
// Storage: calmash.pro's Supabase (single project, all sites write to one table).
// Env vars required:
//   BACKUP_SUPABASE_URL   (e.g. https://rkofwmqiddhrqhgnpiua.supabase.co)
//   BACKUP_SUPABASE_KEY   (service_role JWT)

const ALLOWED_HOSTS = [
  'sosloan.online', 'www.sosloan.online',
  'hlvaha.com', 'www.hlvaha.com',
  'mimonli.com', 'www.mimonli.com',
  'car-loans.co.il', 'www.car-loans.co.il',
  'merkazmimon.com', 'www.merkazmimon.com',
  'guroloans.com', 'www.guroloans.com',
  'mimon360.com', 'www.mimon360.com',
  'mimonchik.com', 'www.mimonchik.com',
  'calmimon.com', 'www.calmimon.com',
  'mimongroup.com', 'www.mimongroup.com',
  'fastmimon.com', 'www.fastmimon.com',
  'hahamcredit.com', 'www.hahamcredit.com',
  'ashraiplus.com', 'www.ashraiplus.com',
  'calmash.pro', 'www.calmash.pro',
  'i-tc.info', 'www.i-tc.info',
  'yfx.co.il', 'www.yfx.co.il',
  'colmatra.com', 'www.colmatra.com',
  'miomnet.com', 'www.miomnet.com',
  'mimonow.com', 'www.mimonow.com',
  'weloan.app', 'www.weloan.app',
  'mimon.net', 'www.mimon.net',
  // Money-locating category (dormant funds / איתור כספים)
  'etorim.com', 'www.etorim.com',
  'lofraier.com', 'www.lofraier.com',
  'ozarot.com', 'www.ozarot.com',
  // Dormant-funds category — site #4
  'harkesef.org.il', 'www.harkesef.org.il',
  // Dormant-funds category — site #5
  'pensiacheck.com', 'www.pensiacheck.com',
  // Dormant-funds category — site #6
  'pencia.net', 'www.pencia.net',
  // Dormant-funds category — site #7
  'zakaot.com', 'www.zakaot.com',
  // Dormant-funds category — site #8
  'miotov.com', 'www.miotov.com',
  // Dormant-funds category — site #9
  'kesefback.com', 'www.kesefback.com',
  // Dormant-funds category — site #10
  'tnoli.org', 'www.tnoli.org'
];

// Higher rate-limit to accommodate progressive saves (multiple per session)
const RATE_BUCKET = new Map();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;

const VALID_STATES = ['pending','partial','submitted','success','failed'];

function isAllowedOrigin(host) {
  if (!host) return false;
  if (ALLOWED_HOSTS.indexOf(host) !== -1) return true;
  if (/\.vercel\.app$/.test(host)) return true;
  return false;
}

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return xf.toString().split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '0.0.0.0';
}

function rateLimitCheck(ip) {
  const now = Date.now();
  const rec = RATE_BUCKET.get(ip);
  if (!rec || rec.resetAt < now) {
    RATE_BUCKET.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (rec.count >= RATE_LIMIT) return false;
  rec.count += 1;
  return true;
}

function parseHost(req) {
  const o = req.headers.origin;
  if (o) { try { return new URL(o).host; } catch (e) {} }
  const r = req.headers.referer;
  if (r) { try { return new URL(r).host; } catch (e) {} }
  return req.headers.host || '';
}

export default async function handler(req, res) {
  const reqOrigin = req.headers.origin || '';
  let allowOrigin = '';
  try {
    const oHost = reqOrigin ? new URL(reqOrigin).host : '';
    if (isAllowedOrigin(oHost)) allowOrigin = reqOrigin;
  } catch (e) {}
  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const host = parseHost(req);
  if (!isAllowedOrigin(host)) { res.status(403).json({ error: 'forbidden' }); return; }

  const ip = getClientIp(req);
  if (!rateLimitCheck(ip)) { res.status(429).json({ error: 'rate_limited' }); return; }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  if (!body || typeof body !== 'object') { res.status(400).json({ error: 'bad_body' }); return; }

  // Honeypot
  if (body.website || body.hp || body._gotcha) {
    res.status(200).json({ ok: true }); return;
  }

  // Validate
  const name  = String(body.name  || '').trim().slice(0, 80);
  const phone = String(body.phone || '').replace(/\D/g, '').slice(0, 15);
  if (!name || name.length < 2)        { res.status(400).json({ error: 'name_required' }); return; }
  if (!/^0\d{8,9}$/.test(phone))       { res.status(400).json({ error: 'phone_invalid' }); return; }

  // lead_state from body — map to allowed leadim_status values.
  // The form_backups CHECK constraint only allows 'pending'/'success'/'failed',
  // so we encode partial/submitted as form_id suffixes and keep status='pending'.
  const raw_state = VALID_STATES.includes(String(body.lead_state || ''))
    ? String(body.lead_state)
    : 'submitted';
  let leadim_status, formIdSuffix = '';
  if (raw_state === 'success')      leadim_status = 'success';
  else if (raw_state === 'failed')  leadim_status = 'failed';
  else                              leadim_status = 'pending';  // partial / submitted / pending → pending
  if (raw_state === 'partial' || raw_state === 'submitted') formIdSuffix = '_' + raw_state;

  const baseFormId = String(body.form_id || '').slice(0, 24); // leave room for suffix
  const form_id = (baseFormId + formIdSuffix).slice(0, 32) || null;

  const payload = {
    source_domain: host,
    source_page:   String(body.source_page || '').slice(0, 200) || null,
    form_id:       form_id,
    name,
    phone,
    consent:    !!body.consent,
    marketing:  !!body.marketing,
    utm_source:   body.utm_source   ? String(body.utm_source).slice(0, 100)   : null,
    utm_medium:   body.utm_medium   ? String(body.utm_medium).slice(0, 100)   : null,
    utm_campaign: body.utm_campaign ? String(body.utm_campaign).slice(0, 200) : null,
    utm_term:     body.utm_term     ? String(body.utm_term).slice(0, 200)     : null,
    utm_content:  body.utm_content  ? String(body.utm_content).slice(0, 200)  : null,
    gclid:        body.gclid        ? String(body.gclid).slice(0, 200)        : null,
    fbclid:       body.fbclid       ? String(body.fbclid).slice(0, 200)       : null,
    user_agent:   (req.headers['user-agent'] || '').slice(0, 400),
    ip_addr:      ip.slice(0, 64),
    leadim_status: leadim_status
  };

  const SB_URL = process.env.BACKUP_SUPABASE_URL || process.env.SUPABASE_URL;
  const SB_KEY = process.env.BACKUP_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SB_URL || !SB_KEY) {
    res.status(500).json({ error: 'backup_not_configured' }); return;
  }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/form_backups`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    if (!r.ok) {
      const t = await r.text();
      res.status(502).json({ error: 'supabase_error', detail: t.slice(0, 200) }); return;
    }
    const rows = await r.json();
    const id = rows && rows[0] && rows[0].id ? rows[0].id : null;
    res.status(200).json({ ok: true, id, state: raw_state, form_id });
  } catch (e) {
    res.status(502).json({ error: 'network', detail: String(e).slice(0, 200) });
  }
}

export const config = { runtime: 'nodejs' };
