import { supabase, LEAD_TABLE } from '../lib/supabase.js';

// Registers a lead in the RouteGuard safety-net table so the check-pending cron
// will fire route_adv on it after 180s if the flow isn't completed.
//
// Two modes:
//   1. Default (POST { lead_id }) — idempotent INSERT. If a row already exists
//      for this lead_id, leave it alone.
//   2. Reopen (POST { lead_id, reopen: true }) — used when the user previously
//      opted out (e.g. clicked "not interested" on fld_351761, which called
//      mark-completed) and has now changed their mind. Resets completed:false
//      so RouteGuard will still rescue the lead if they abandon again. Only
//      reopens if the lead has NOT been routed — never un-routes a lead that
//      already went out to an advertiser.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { lead_id, reopen } = req.body || {};
    if (!lead_id || typeof lead_id !== 'string') {
      return res.status(400).json({ error: 'Missing lead_id' });
    }

    if (reopen === true) {
      const { error: reopenError } = await supabase
        .from(LEAD_TABLE)
        .update({ completed: false, completed_at: null })
        .eq('lead_id', lead_id)
        .eq('routed', false);
      if (reopenError) {
        console.error('schedule-route reopen error:', reopenError);
        return res.status(500).json({ error: 'Database error', detail: reopenError.message });
      }
      return res.status(200).json({ ok: true, reopened: true });
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
