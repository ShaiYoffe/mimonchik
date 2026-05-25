// Send a 4-digit OTP via the InfoRU XML SMS API (ESM module).
import crypto from 'node:crypto';

const INFORU_XML_URL = 'https://api.inforu.co.il/SendMessageXml.ashx';
const OTP_WINDOW_MS = 5 * 60 * 1000;
const ALLOWED_ORIGINS = [
  'https://mimonchik.com',
  'https://www.mimonchik.com',
];

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 9 && digits.startsWith('5')) return '0' + digits;
  if (digits.length === 10 && /^0[2-9]/.test(digits)) return digits;
  if (digits.length === 12 && digits.startsWith('972')) return '0' + digits.slice(3);
  return null;
}

function isMobile(phone) {
  return /^05[0-9]\d{7}$/.test(phone);
}

function generateCode(phone, windowIdx) {
  const secret = process.env.OTP_SECRET || 'ymedia-otp-default-secret-please-change';
  const h = crypto
    .createHmac('sha256', secret)
    .update(`${phone}:${windowIdx}`)
    .digest('hex');
  const num = parseInt(h.slice(0, 8), 16);
  return String(num % 10000).padStart(4, '0');
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function trySend(authXml, phone, message, sender) {
  const intlPhone = '972' + phone.replace(/^0/, '');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Inforu>${authXml}<Content Type="sms"><Message><![CDATA[${message}]]></Message></Content><Recipients><PhoneNumber>${xmlEscape(intlPhone)}</PhoneNumber></Recipients><Settings><Sender><![CDATA[${sender}]]></Sender></Settings></Inforu>`;
  const body = 'InforuXML=' + encodeURIComponent(xml);
  const r = await fetch(INFORU_XML_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

async function tryJsonV2(user, token, phone, message, sender) {
  const intlPhone = '972' + phone.replace(/^0/, '');
  const body = { Data: { Message: message, Recipients: [{ Phone: intlPhone }], Settings: { Sender: sender } } };
  const auth = Buffer.from(`${user}:${token}`).toString('base64');
  const r = await fetch('https://capi.inforu.co.il/api/v2/SMS/SendSms', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

async function sendInforuSMS(phone, code) {
  const user = (process.env.INFORU_USER || '').trim();
  const token = (process.env.INFORU_TOKEN || '').trim();
  if (!user || !token) throw new Error('InfoRU credentials missing');
  const sender = (process.env.OTP_SENDER || 'mimonchik').trim();
  const message = `קוד אימות הזהות שלך לבדיקת תיק הביטוח במימונצ׳יק: ${code}`;

  const variants = [
    { name: 'xml-ApiToken', kind: 'xml', xml: `<User><Username>${xmlEscape(user)}</Username><ApiToken>${xmlEscape(token)}</ApiToken></User>` },
    { name: 'xml-Password', kind: 'xml', xml: `<User><Username>${xmlEscape(user)}</Username><Password>${xmlEscape(token)}</Password></User>` },
    { name: 'jsonV2-Basic', kind: 'jsonv2' },
  ];
  const errors = [];
  for (const v of variants) {
    let res;
    if (v.kind === 'xml') res = await trySend(v.xml, phone, message, sender);
    else res = await tryJsonV2(user, token, phone, message, sender);
    if (!res.ok && v.kind === 'xml') { errors.push(`${v.name} → HTTP ${res.status}`); continue; }
    if (v.kind === 'xml' && /<Status>\s*1\s*<\/Status>/.test(res.text)) {
      console.log(`[otp-send] InfoRU accepted via ${v.name}`);
      return res.text;
    }
    if (v.kind === 'jsonv2' && res.ok) {
      try {
        const j = JSON.parse(res.text);
        const status = j && (j.StatusId || (j.Data && j.Data.StatusId));
        if (status === 1 || status === '1') {
          console.log(`[otp-send] InfoRU accepted via ${v.name}`);
          return res.text;
        }
      } catch {}
    }
    errors.push(`${v.name} → ${res.text.slice(0, 150)}`);
  }
  throw new Error('All InfoRU auth attempts failed: ' + errors.join(' | '));
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin) || origin === '') {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  let body;
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch (e) { return res.status(400).json({ success: false, error: 'Bad request' }); }
  const phone = normalizePhone(body.phone);
  if (!phone || !isMobile(phone)) return res.status(400).json({ success: false, error: 'מספר נייד ישראלי לא תקין' });
  const windowIdx = Math.floor(Date.now() / OTP_WINDOW_MS);
  const code = generateCode(phone, windowIdx);
  if (process.env.OTP_TEST_MODE === '1') {
    console.log(`[otp-send] TEST MODE — phone=${phone} code=${code}`);
    return res.status(200).json({ success: true, _test: true });
  }
  try {
    const upstream = await sendInforuSMS(phone, code);
    console.log('[otp-send] InfoRU OK:', upstream.slice(0, 200));
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[otp-send] error:', e.message);
    return res.status(500).json({ success: false, error: 'שליחת ה-SMS נכשלה. אנא נסה שוב.' });
  }
}
