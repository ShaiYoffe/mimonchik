/*! Lead backup client (YMEDIA) v3 — zero-loss lead capture.
 *
 * Three layers of protection:
 *   1. PROGRESSIVE SAVE — when phone+name become valid (blur), save as 'partial'
 *   2. SUBMIT SAVE — on submit click, save as 'submitted' (parallel to Leadim)
 *   3. RETRY QUEUE — failed sends queued in localStorage, retried on next page load
 *
 * Result: a lead is captured if the user TYPED valid data, regardless of:
 *   - Whether they clicked submit
 *   - Whether Leadim was reachable
 *   - Whether network was up
 *   - Whether they closed the tab mid-submit
 */
(function () {
  var LS_QUEUE = 'lb_q_v1';
  var LS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7-day expiry on queued items
  var MAX_RETRIES = 5;
  var MAX_QUEUE = 20;
  var SENT = {}; // dedup per session: hash → true

  /* ---------- Honeypot ---------- */
  function injectHoneypot() {
    var forms = document.querySelectorAll('form');
    [].forEach.call(forms, function (f) {
      if (f.querySelector('input[name="website_url"]')) return;
      var hp = document.createElement('input');
      hp.type = 'text'; hp.name = 'website_url'; hp.tabIndex = -1;
      hp.autocomplete = 'off'; hp.setAttribute('aria-hidden', 'true');
      hp.style.cssText = 'position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0';
      f.appendChild(hp);
    });
    if (!document.getElementById('__hp_field')) {
      var hp = document.createElement('input');
      hp.type = 'text'; hp.name = 'website_url'; hp.id = '__hp_field';
      hp.tabIndex = -1; hp.autocomplete = 'off';
      hp.setAttribute('aria-hidden', 'true');
      hp.style.cssText = 'position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0';
      document.body.appendChild(hp);
    }
  }

  /* ---------- Field readers ---------- */
  function readUTM() {
    var p = new URLSearchParams(location.search);
    var out = {};
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'].forEach(function (k) {
      var v = p.get(k); if (v) out[k] = v;
    });
    return out;
  }
  function pickName() {
    var ids = ['nameInput','fullName','firstName','name'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && el.value) return el.value.trim();
    }
    var byName = document.querySelector('input[name="name"],input[name="fullname"],input[name="full_name"],input[autocomplete="name"]');
    return byName && byName.value ? byName.value.trim() : '';
  }
  function pickPhone() {
    var ids = ['phoneInput','phone','tel','mobile'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && el.value) return el.value.trim().replace(/\D/g, '');
    }
    var byName = document.querySelector('input[type="tel"],input[name="phone"],input[autocomplete="tel"]');
    return byName && byName.value ? byName.value.trim().replace(/\D/g, '') : '';
  }
  function pickBool(ids) {
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && typeof el.checked === 'boolean') return el.checked;
    }
    return false;
  }
  function pickHoneypot() {
    var el = document.querySelector('input[name="website_url"]');
    return el && el.value ? el.value : '';
  }
  function guessFormId() {
    var path = location.pathname || '';
    if (/\/tax(\/|$)/.test(path))    return '49500';
    if (/\/bdi(\/|$)/.test(path))    return '49502';
    if (/\/loan(\/|$|-)/.test(path)) return '49502';
    return '49502';
  }

  /* ---------- Payload builder ---------- */
  function buildBody(leadState) {
    var name  = pickName();
    var phone = pickPhone();
    if (!name || name.length < 2)   return null;
    if (!/^0\d{8,9}$/.test(phone))  return null;
    var body = {
      name: name,
      phone: phone,
      consent:   pickBool(['consentBox','consent']),
      marketing: pickBool(['marketingBox','marketing']),
      source_page: location.pathname,
      form_id:   guessFormId(),
      website:   pickHoneypot(),
      lead_state: leadState || 'submitted'
    };
    Object.assign(body, readUTM());
    return body;
  }
  function hashKey(body) { return body.phone + '|' + body.lead_state; }

  /* ---------- localStorage retry queue ---------- */
  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(LS_QUEUE) || '[]') || []; }
    catch (e) { return []; }
  }
  function saveQueue(arr) {
    try { localStorage.setItem(LS_QUEUE, JSON.stringify(arr)); } catch (e) {}
  }
  function enqueue(body) {
    var q = loadQueue();
    body._queued_at = body._queued_at || Date.now();
    body._retries   = body._retries   || 0;
    if (body._retries >= MAX_RETRIES) return;
    if ((Date.now() - body._queued_at) > LS_TTL_MS) return;
    q.push(body);
    if (q.length > MAX_QUEUE) q = q.slice(-MAX_QUEUE);
    saveQueue(q);
  }
  function flushQueue() {
    var q = loadQueue();
    if (!q.length) return;
    saveQueue([]); // clear; failures will re-add via enqueue
    q.forEach(function (item) {
      if ((Date.now() - (item._queued_at || 0)) > LS_TTL_MS) return; // expired
      item._retries = (item._retries || 0) + 1;
      if (item._retries > MAX_RETRIES) return;
      delete SENT[hashKey(item)]; // reset dedup
      sendNow(item);
    });
  }

  /* ---------- Send (with retry queue on failure) ---------- */
  function sendNow(body) {
    var key = hashKey(body);
    if (SENT[key]) return;
    SENT[key] = true;

    function onFail() {
      SENT[key] = false; // allow re-send via queue
      enqueue(body);
    }

    try {
      fetch('/api/lead-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
        credentials: 'omit'
      }).then(function (r) {
        if (!r.ok) onFail();
      }).catch(onFail);
    } catch (e) { onFail(); }
  }

  /* ---------- Triggers ---------- */
  function sendPartial() {
    var body = buildBody('partial');
    if (body) sendNow(body);
  }
  function sendSubmitted() {
    var body = buildBody('submitted');
    if (body) sendNow(body);
  }

  /* ---------- Bind listeners ---------- */
  function bindFields() {
    var phoneEl = document.getElementById('phoneInput')
               || document.querySelector('input[type="tel"],input[name="phone"],input[autocomplete="tel"]');
    if (phoneEl && !phoneEl.__lb) {
      phoneEl.__lb = true;
      phoneEl.addEventListener('blur', sendPartial);
      var t;
      phoneEl.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(sendPartial, 900); // debounce: send 0.9s after last keystroke
      });
    }
    var nameEl = document.getElementById('nameInput')
              || document.querySelector('input[name="name"],input[autocomplete="name"]');
    if (nameEl && !nameEl.__lb) {
      nameEl.__lb = true;
      nameEl.addEventListener('blur', sendPartial);
    }
    var btn = document.getElementById('submitBtn');
    if (btn && !btn.__lb) {
      btn.__lb = true;
      btn.addEventListener('click', sendSubmitted, true); // capture phase → fires BEFORE Leadim
    }
    var forms = document.querySelectorAll('form');
    [].forEach.call(forms, function (f) {
      if (f.__lb) return;
      f.__lb = true;
      f.addEventListener('submit', sendSubmitted, true);
    });
  }

  function init() {
    try {
      injectHoneypot();
      bindFields();
      flushQueue(); // retry any leads queued from previous page load / network failure
      // Re-bind in case form/inputs load late
      setTimeout(bindFields, 800);
      setTimeout(bindFields, 2000);
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
