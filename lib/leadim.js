const LEADIM_URL = 'https://proxy.leadim.xyz/apiproxy/5517/api/lead_update.ashx';
const LEADIM_AUTH = 'U-D9C699243FA04F94.B2A1BCAD1B2E2B89';

export async function fireRouteAdv(leadId) {
  const body = new URLSearchParams();
  body.append('by_id', leadId);
  body.append('route_adv', 'true');

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
