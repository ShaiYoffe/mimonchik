import { supabase, LEAD_TABLE } from '../lib/supabase.js';
import { fireRouteAdv } from '../lib/leadim.js';

const TIMEOUT_SECONDS = 180;

// לידאיים עונה 200 גם על כישלון (גוף JSON עם status:"failure"), ו-"Lead already in
// this state" מגיע כ-status:"success" — לכן בודקים גם HTTP וגם את גוף-התשובה.
function leadimAccepted(r) {
  if (!r || !r.ok) return false;
  try {
    const j = JSON.parse(String(r.body || ''));
    if (j && typeof j.status === 'string') return j.status.toLowerCase() === 'success';
  } catch (_) { /* גוף לא-JSON עם 200 — מקבלים */ }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const providedSecret = req.headers['x-cron-secret'];
  const expectedSecret = (process.env.CRON_SECRET || '').trim();
  if (!providedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const cutoff = new Date(Date.now() - TIMEOUT_SECONDS * 1000).toISOString();
    const { data: pending, error: selectError } = await supabase
      .from(LEAD_TABLE)
      .select('lead_id, created_at')
      .eq('completed', false)
      .eq('routed', false)
      .lt('created_at', cutoff)
      // חלון-רטריי: שורות מ-24 השעות האחרונות בלבד — כישלון קבוע (ליד שנמחק בלידאיים)
      // לא יחסום את התור לנצח. הישנות ביותר קודם.
      .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order('created_at', { ascending: true })
      .limit(50);

    if (selectError) {
      console.error('check-pending select error:', selectError);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!pending || pending.length === 0) {
      return res.status(200).json({ ok: true, processed: 0 });
    }

    const results = [];
    for (const row of pending) {
      try {
        const sourceDomain = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
        const leadimResult = await fireRouteAdv(row.lead_id, sourceDomain);
        // 16/08/2026 — לסמן routed=true **רק** כשלידאיים באמת קיבלה את ה-route_adv.
        // עד היום סומן routed גם על כישלון (HTTP 5xx / {"status":"failure"}) — ליד
        // כזה נחשב "מנותב" ולא נוסה שוב לעולם. עכשיו: כישלון → נשאר routed=false →
        // הקרון מנסה שוב בדקה הבאה (חלון-הרטריי מוגבל ל-24 שעות מיצירת השורה).
        if (!leadimAccepted(leadimResult)) {
          console.warn(`route_adv not accepted for ${row.lead_id}:`, leadimResult && leadimResult.status, String((leadimResult && leadimResult.body) || '').slice(0, 160));
          results.push({ lead_id: row.lead_id, fired: false, marked: false, retry: true });
          continue;
        }
        const { error: updateError } = await supabase
          .from(LEAD_TABLE)
          .update({ routed: true, routed_at: new Date().toISOString() })
          .eq('lead_id', row.lead_id);

        if (updateError) {
          console.error(`Failed to mark lead ${row.lead_id} as routed:`, updateError);
          results.push({ lead_id: row.lead_id, fired: leadimResult.ok, marked: false });
        } else {
          results.push({ lead_id: row.lead_id, fired: leadimResult.ok, marked: true });
        }
      } catch (err) {
        console.error(`Error processing lead ${row.lead_id}:`, err);
        results.push({ lead_id: row.lead_id, error: err.message });
      }
    }

    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error('check-pending error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
