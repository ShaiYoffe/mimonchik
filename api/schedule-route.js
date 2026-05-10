import { supabase, LEAD_TABLE } from '../lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { lead_id } = req.body || {};
    if (!lead_id || typeof lead_id !== 'string') {
      return res.status(400).json({ error: 'Missing lead_id' });
    }

    const { data, error } = await supabase
      .from(LEAD_TABLE)
      .upsert(
        { lead_id, completed: false, routed: false },
        { onConflict: 'lead_id', ignoreDuplicates: true }
      )
      .select();

    if (error) {
      console.error('schedule-route supabase error:', error);
      return res.status(500).json({ error: 'Database error', detail: error.message, code: error.code });
    }

    return res.status(200).json({ ok: true, inserted: Array.isArray(data) && data.length > 0 });
  } catch (err) {
    console.error('schedule-route error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
