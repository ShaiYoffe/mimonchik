/*! Lead backup client (YMEDIA).
 * Fires a parallel POST to /api/lead-backup right before the form's normal Leadim submit,
 * using fetch keepalive so the user never waits. Result: a Supabase copy of every lead,
 * even if Leadim is down/blocked.
 */
(function () {
  // Inject a hidden honeypot field into every form on the page (bots fill it; humans don't).
  function injectHoneypot() {
    var forms = document.querySelectorAll('form');
    [].forEach.call(forms, function (f) {
      if (f.querySelector('input[name="website_url"]')) return;
      var hp = document.createElement('input');
      hp.type = 'text';
      hp.name = 'website_url';
      hp.tabIndex = -1;
      hp.autocomplete = 'off';
      hp.setAttribute('aria-hidden', 'true');
      hp.style.cssText = 'position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0';
      f.appendChild(hp);
    });
    // Also create a free-standing one for pages whose form fields aren't inside a <form>.
    if (!document.getElementById('__hp_field')) {
      var hp = document.createElement('input');
      hp.type = 'text';
      hp.name = 'website_url';
      hp.id = '__hp_field';
      hp.tabIndex = -1;
      hp.autocomplete = 'off';
      hp.setAttribute('aria-hidden', 'true');
      hp.style.cssText = 'position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0';
      document.body.appendChild(hp);
    }
  }

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
    if (/\/tax(\/|$)/.test(path))          return '49500';
    if (/\/bdi(\/|$)/.test(path))          return '49502';
    if (/\/loan(\/|$|-)/.test(path))       return '49502';
    if (/\/loan-check(\/|$)/.test(path))   return '49502';
    return '49502';
  }

  function sendBackup() {
    try {
      var name  = pickName();
      var phone = pickPhone();
      if (!name || name.length < 2)    return;
      if (!/^0\d{8,9}$/.test(phone))   return;

      var body = {
        name:        name,
        phone:       phone,
        consent:     pickBool(['consentBox','consent']),
        marketing:   pickBool(['marketingBox','marketing']),
        source_page: location.pathname,
        form_id:     guessFormId(),
        website:     pickHoneypot()
      };
      Object.assign(body, readUTM());

      // keepalive = browser keeps the request alive even if the page navigates away (form submit)
      fetch('/api/lead-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
        credentials: 'omit'
      }).catch(function () { /* silently ignore network errors */ });
    } catch (e) {}
  }

  function bindSubmit() {
    var btn = document.getElementById('submitBtn');
    if (btn && !btn.__bkpBound) {
      btn.__bkpBound = true;
      // Use CAPTURE so we run BEFORE the form's own click handler.
      btn.addEventListener('click', sendBackup, true);
    }
    // For native form submit events (some sites)
    var forms = document.querySelectorAll('form');
    [].forEach.call(forms, function (f) {
      if (f.__bkpBound) return;
      f.__bkpBound = true;
      f.addEventListener('submit', sendBackup, true);
    });
  }

  function init() {
    injectHoneypot();
    bindSubmit();
    // Bind again later in case the form is added/rendered after first paint
    setTimeout(bindSubmit, 800);
    setTimeout(bindSubmit, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
