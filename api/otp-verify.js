// Verify a 4-digit OTP (ESM module).
import crypto from 'node:crypto';

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

function generateCode(phone, windowIdx) {
  const secret = process.env.OTP_SECRET || 'ymedia-otp-default-secret-please-change';
  const h = crypto
    .createHmac('sha256', secret)
    .update(`${phone}:${windowIdx}`)
    .digest('hex');
  const num = parseInt(h.slice(0, 8), 16);
  return String(num % 10000).padStart(4, '0');
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
  const code = String(body.code || '').trim();
  if (!phone) return res.status(400).json({ success: false, error: 'מספר טלפון לא תקין' });
  if (!/^\d{4}$/.test(code)) return res.status(400).json({ success: false, error: 'הקוד חייב להיות 4 ספרות' });
  // Hardened 2026-06-23 — bypass only works on non-production environments.
  // Even if OTP_TEST_MODE is accidentally set on prod, VERCEL_ENV gate stops it.
  if (process.env.OTP_TEST_MODE === '1' && process.env.VERCEL_ENV !== 'production' && code === '1234') return res.status(200).json({ success: true, _test: true });
  const now = Math.floor(Date.now() / OTP_WINDOW_MS);
  for (const wi of [now, now - 1]) {
    if (generateCode(phone, wi) === code) return res.status(200).json({ success: true });
  }
  return res.status(200).json({ success: false, error: 'הקוד שגוי או פג תוקף' });
}
