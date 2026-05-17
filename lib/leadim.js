// Leadim API helper — sends route_adv=true for a given lead.
// This is the single source of truth for routing a lead to an advertiser
// from the RouteGuard safety-net cron (api/check-pending).
//
// Every RouteGuard-fired lead also gets stamped with the custom Leadim field
// fld_374431="true" so the user can distinguish in the CRM between leads
// rescued by the cron (RouteGuard) vs. leads routed naturally on flow
// completion (where the frontend fires route_adv directly without this stamp).

const LEADIM_URL = 'https://proxy.leadim.xyz/apiproxy/5517/api/lead_update.ashx';
const LEADIM_AUTH = 'U-D9C699243FA04F94.B2A1BCAD1B2E2B89';

// Custom field in Leadim CRM (display name: "route_adv") — flagged on every
// RouteGuard-rescued lead so they're visible/filterable in the CRM.
const ROUTEGUARD_STAMP_FIELD = 'fld_374431';
const ROUTEGUARD_STAMP_VALUE = 'true';

export async function fireRouteAdv(leadId) {
  const body = new URLSearchParams();
  body.append('by_id', leadId);
  body.append('route_adv', 'true');
  body.append(ROUTEGUARD_STAMP_FIELD, ROUTEGUARD_STAMP_VALUE);

  const res = await fetch(LEADIM_URL, {
    method: 'POST',
    headers: {
      'X-LEAD-IM-AUTH': LEADIM_AUTH,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}
