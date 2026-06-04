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

export async function fireRouteAdv(leadId, sourceDomain) {
  const body = new URLSearchParams();
  body.append('by_id', leadId);
  body.append('route_adv', 'true');
  body.append(ROUTEGUARD_STAMP_FIELD, ROUTEGUARD_STAMP_VALUE);
  // fld_179827 — NOT re-stamped here (fix 2026-06-04). The lead's source
  // field was already set correctly at lead-creation time (every homepage
  // form stamps fld_179827=window.location.hostname). The cron used to
  // overwrite it with its OWN host, which was wrong: pg_cron points to one
  // fixed URL, so every lead got rewritten to that single host (e.g.
  // yfx.co.il), erasing the real origin. The `sourceDomain` parameter
  // remains in the signature for backward-compatibility with callers, but
  // is intentionally ignored.

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
