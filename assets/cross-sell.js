/*! YMedia Cross-Sell module v2 — insurance + tax + telecom cross-sell layer.
 *
 *  Usage:
 *    window.YMediaCrossSell.start({
 *      name: 'שי', phone: '0501234567', age: '34',
 *      redirectOnComplete: '/toda-toda/',
 *      // optional — only needed when the host page captured extra context:
 *      extra: { incomeNis: '8000', cityName: 'תל אביב', email: '...', city: '...', birthday: 'YYYY-MM-DD' }
 *    });
 *
 *  Hooks Leadim directly:
 *    - Creates insurance lead (form=49491) when user clicks pitch-yes
 *    - Creates tax lead       (form=49500) when user clicks tax-pitch-yes
 *    - Creates telecom lead   (form=87446) when user clicks telecom-pitch-yes
 *    - Fires route_adv on each lead on its final step
 *    - Talks to /api/schedule-route + /api/mark-completed for RouteGuard cron
 *  Stamps fld_374431='true' on lib/leadim.js side already (server cron path).
 */
(function () {
  'use strict';

  // ============ Config ============
  const LEADIM_UPDATE = 'https://proxy.leadim.xyz/apiproxy/5517/api/lead_update.ashx';
  const LEADIM_CREATE = 'https://proxy.leadim.xyz/APIProxy/global/submit.cors.v2.ashx';
  const LEADIM_AUTH   = 'U-D9C699243FA04F94.B2A1BCAD1B2E2B89';
  const INSURANCE_FORM = { lm_form: '49491', lm_key: '483163189b' };
  const TAX_FORM       = { lm_form: '49500', lm_key: '3ab37a64cb' };
  const TELECOM_FORM   = { lm_form: '87446', lm_key: 'be23acf6d1' };

  // ============ Identity cache ============
  // Why: cross-sell leads were being created with empty name/phone in Leadim
  // whenever the URL query string was lost between the homepage form submit
  // and the cross-sell entry point (page refresh, back-button, opening in a
  // new tab, ad-blocker rewrites, mobile share-sheet). We now defensively
  // cache identity to localStorage on the homepage right before redirect,
  // read it back here if URL params are missing, and as a last line of
  // defense surface a re-entry mini-form so we never POST empty identity
  // to Leadim. 24h TTL keeps the cache from leaking across sessions.
  const STORAGE_KEY = 'ymcs_user_v1';
  const STORAGE_TTL_MS = 24 * 60 * 60 * 1000;
  function readStoredUser() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || (Date.now() - (obj.ts || 0)) > STORAGE_TTL_MS) return null;
      return obj;
    } catch (e) { return null; }
  }
  function writeStoredUser(u) {
    try {
      if (!u || (!u.name && !u.phone)) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        name: u.name || '', phone: u.phone || '', age: u.age || '', ts: Date.now()
      }));
    } catch (e) {}
  }

  // ============ State ============
  const state = {
    activeFlow: null,            // 'insurance' | 'tax' | 'telecom' | null
    insuranceLeadId: null,
    taxLeadId: null,
    telecomLeadId: null,
    insuranceOptedOut: false,
    user: { name: '', phone: '', age: '' },
    extra: {},                   // incomeNis, cityName, email, city, birthday, etc.
    answers: {},                 // step_id → answer (local only)
    currentStep: null,
    history: [],                 // stack of step ids the user has seen (for back)
    redirectOnComplete: '/'
  };

  // Steps that have nowhere meaningful to go back to. The whole telecom flow
  // is no-back: once the user has consented (or declined), the lead has been
  // created in Leadim and back-navigation would either spam duplicate leads
  // or require complex idempotency logic.
  const NO_BACK_STEPS = {
    'pitch_ins': 1, 'done': 1, 'telecom_done': 1,
    'pitch_telecom': 1, 'fld_377286': 1, 'fld_377286_other': 1
  };

  // ============ Step plan ============
  // Each step: { id, type, q, hint, options, next, conditional_next, fld, ... }
  // 'fld' is the Leadim field id; 'id' is the local step name (can differ for non-Leadim steps like pitches)
  const STEPS = [
    // Pre-step: re-entry mini-form, shown only when name OR phone is missing
    // at start() time. Prevents empty-identity leads in Leadim. The form
    // submission writes back into state.user + localStorage and resumes the
    // originally-intended pitch path (pitch_ins or pitch_tax).
    { id: '_reentry',   type: 'reentry' },

    // Employment status — ALWAYS the first cross-sell question (regardless of insurance path).
    // Field ID + answer options match the loan-vertical questionnaire (fld_183161).
    // The answer is stored on state.employmentStatus and attached to every lead created later
    // (insurance + tax + telecom) — since at THIS moment no flow lead exists in Leadim yet,
    // we can't call updateLead. Routing after answer goes via next_fn (decided at start()).
    { id: 'fld_183161', type: 'choices', fld: 'fld_183161',
      q: 'מה הסטטוס התעסוקתי שלך?',
      hint: 'אנחנו עובדים עם שכירים, עצמאים ופנסיונרים כאחד — לכל סטטוס יש מסלולים מותאמים.',
      options: ['שכיר', 'עוסק פטור', 'עוסק מורשה', 'חברה בע״מ', 'פנסיונר/ית', 'לא עובד/ת'],
      next_fn: function(s) { return s._postEmploymentNext || 'pitch_tax'; } },

    // Insurance flow
    { id: 'pitch_ins',  type: 'pitch_ins',
      next: 'fld_351761', next_on_no: 'pitch_tax' },
    { id: 'fld_351761', type: 'insurer_picker', fld: 'fld_351761',
      next: 'fld_374354', next_on_skip: 'pitch_tax' },
    { id: 'fld_374354', type: 'yes_no', fld: 'fld_374354',
      q: 'האם חלילה ישנן מחלות קשות?',
      hint: 'המידע מאובטח 🔒 ועוזר לנו להתאים לך את הכיסוי הביטוחי הנכון.',
      conditional_next: { 'כן': 'fld_246786', 'לא': 'fld_179823' } },
    { id: 'fld_246786', type: 'text', fld: 'fld_246786',
      q: 'אלו מחלות?', hint: 'פירוט קצר עוזר להתאים את הכיסוי המתאים.',
      placeholder: 'לדוגמא: סוכרת, יתר לחץ דם',
      next: 'fld_179823' },
    { id: 'fld_179823', type: 'money', fld: 'fld_179823',
      q: 'כמה אתה משלם בחודש על ביטוח פרטי?',
      hint: 'סה״כ כל הביטוחים הפרטיים שלך — נשתמש בזה כדי לחשב את החיסכון הפוטנציאלי.',
      placeholder: 'לדוגמא: 600',
      next: 'fld_179822' },
    { id: 'fld_179822', type: 'multi', fld: 'fld_179822',
      q: 'אילו סוגי ביטוחים יש לך?', hint: 'ניתן לבחור יותר מאפשרות אחת.',
      options: ['ביטוח חיים','ביטוח בריאות','ביטוח רכב','ביטוח דירה ומבנה','ביטוח עסק','ביטוח משכנתא','ביטוח סיעוד','ביטוח תאונות אישיות','ביטוח שיניים','ביטוח נסיעות','אחר'],
      next: 'fld_223541' },
    { id: 'fld_223541', type: 'multi', fld: 'fld_223541',
      q: 'באיזו חברת ביטוח אתה מבוטח כיום?', hint: 'ניתן לבחור יותר מאפשרות אחת — בחר את כל החברות הרלוונטיות.',
      options: ['הראל','כלל ביטוח','מנורה מבטחים','מגדל','הפניקס','איילון','ביטוח חקלאי','שלמה ביטוח','שירביט','AIG ישראל','הכשרה ביטוח','ביטוח ישיר','WeSure','אחר'],
      next: 'fld_209868' },
    { id: 'fld_209868', type: 'date', fld: 'fld_209868',
      q: 'מה תאריך הנפקת תעודת הזהות שלך?',
      hint: 'התאריך מופיע על תעודת הזהות שלך — נדרש לאימות זהות מול גורמי הביטוח.',
      next: 'pitch_tax', fire_route_adv: 'insurance' },

    // Tax flow
    { id: 'pitch_tax',  type: 'pitch_tax',
      next: 't_halat', next_on_no: 'pitch_telecom' },
    { id: 't_halat',    type: 'yes_no', fld: 'fld_261441',
      q: 'האם היית בחל"ת (חופשה ללא תשלום) ב-6 השנים האחרונות?',
      hint: 'חל"ת בעבר עשוי לזכות אותך בהחזר מס משמעותי.', next: 't_sellhouse' },
    { id: 't_sellhouse',type: 'yes_no', fld: 'fld_261442',
      q: 'האם מכרת נכס ושילמת מס שבח ב-6 השנים האחרונות?', next: 'fld_262202' },
    { id: 'fld_262202', type: 'choices', fld: 'fld_262202',
      q: 'מה המצב המשפחתי שלך?',
      options: ['נשוי/אה','רווק/ה','גרוש/ה','אלמן/ה','ידוע/ה בציבור'],
      next: 'fld_262203' },
    { id: 'fld_262203', type: 'choices', fld: 'fld_262203',
      q: 'כמה ילדים יש לך?',
      options: ['0','1','2','3','4','5 ומעלה'],
      next: 'fld_262195' },
    { id: 'fld_262195', type: 'yes_no', fld: 'fld_262195',
      q: 'האם נולד לך ילד ב-6 השנים האחרונות?', next: 'fld_262198' },
    { id: 'fld_262198', type: 'yes_no', fld: 'fld_262198',
      q: 'האם משכת כספים מקרן פנסיה / גמל / השתלמות ושילמת מס?', next: 'fld_262194' },
    { id: 'fld_262194', type: 'yes_no', fld: 'fld_262194',
      q: 'האם שילמת מס הכנסה ב-6 השנים האחרונות?', next: 'fld_262197' },
    { id: 'fld_262197', type: 'yes_no', fld: 'fld_262197',
      q: 'האם ספגת הפסדים בשוק ההון ב-6 השנים האחרונות?', next: 'fld_264803' },
    { id: 'fld_264803', type: 'yes_no', fld: 'fld_264803',
      q: 'האם יש לך ביטוח משכנתא?', next: 'fld_264802' },
    { id: 'fld_264802', type: 'yes_no', fld: 'fld_264802',
      q: 'האם יש לך ביטוח חיים?', next: 'fld_200204' },
    { id: 'fld_200204', type: 'yes_no', fld: 'fld_200204',
      q: 'האם החלפת עבודה ב-6 השנים האחרונות?', next: 'fld_179836' },
    { id: 'fld_179836', type: 'yes_no', fld: 'fld_179836',
      q: 'האם הינך תורם למוסדות ללא כוונת רווח?', next: 'fld_179834' },
    { id: 'fld_179834', type: 'yes_no', fld: 'fld_179834',
      q: 'האם אתה הורה לילד עם לקויות למידה?', next: 'fld_369524' },
    { id: 'fld_369524', type: 'yes_no', fld: 'fld_369524',
      q: 'האם יש לך ילדים בחינוך מיוחד?', next: 'fld_369531' },
    { id: 'fld_369531', type: 'yes_no', fld: 'fld_369531',
      q: 'האם יש לך השכלה אקדמית (תואר / תעודה)?', next: 'fld_369530' },
    { id: 'fld_369530', type: 'yes_no', fld: 'fld_369530',
      q: 'האם שירתת בצבא / שירות לאומי?', next: 'fld_369528' },
    { id: 'fld_369528', type: 'yes_no', fld: 'fld_369528',
      q: 'האם אתה משלם מזונות?', next: 'fld_369525' },
    { id: 'fld_369525', type: 'yes_no', fld: 'fld_369525',
      q: 'האם יש לך נכות (עצמית או במשפחה)?', next: 'fld_369526' },
    { id: 'fld_369526', type: 'yes_no', fld: 'fld_369526',
      q: 'האם הינך עולה חדש?', next: 'fld_369527' },
    { id: 'fld_369527', type: 'yes_no', fld: 'fld_369527',
      q: 'האם אתה גר ביישוב ספר?', next: 'fld_375784' },
    { id: 'fld_375784', type: 'text_optional', fld: 'fld_375784',
      q: 'האם יש לך מקורות הכנסה נוספים?',
      hint: 'לדוגמא: שכ"ד, השכרת נכס, עבודה צדדית וכו׳',
      placeholder: 'פרט: לדוגמא, השכרת דירה',
      next: 'pitch_telecom', fire_route_adv: 'tax' },

    // Telecom flow — final cross-sell. Shown to EVERY user who reaches the end
    // (whether they completed tax, skipped tax, or skipped both insurance+tax).
    // Opt-outs are also captured (lead created with fld_377288='לא') but NOT
    // route_adv'd — they exist only for the user's analytics, not for the
    // advertiser. fld_377286='אחר' branches to a text input so the advertiser
    // gets the actual provider name, not just "other".
    { id: 'pitch_telecom', type: 'pitch_telecom', fld: 'fld_377288' },
    { id: 'fld_377286', type: 'telecom_provider', fld: 'fld_377286' },
    { id: 'fld_377286_other', type: 'text', fld: 'fld_377286',
      q: 'איזה ספק תקשורת אתה לקוח שלו?',
      hint: 'פרט את שם הספק כדי שנציג מורשה יוכל לתת לך הצעה מותאמת.',
      placeholder: 'לדוגמא: שם הספק',
      next: 'telecom_done', fire_route_adv: 'telecom' },
    { id: 'telecom_done', type: 'telecom_final' },

    { id: 'done', type: 'final' }
  ];

  const stepMap = STEPS.reduce((m, s) => (m[s.id] = s, m), {});
  // Total user-facing steps (excludes 'done' and the pre-step '_reentry'
  // which is invisible when identity was passed correctly).
  const totalSteps = STEPS.filter(s => s.id !== 'done' && s.id !== '_reentry').length;
  const stepIndex = STEPS.reduce((m, s, i) => (m[s.id] = i, m), {});

  // ============ Leadim helpers ============
  function buildQuery(payload) {
    return Object.keys(payload).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(payload[k] == null ? '' : payload[k]);
    }).join('&');
  }

  function createLead(formCfg, payload) {
    // LAST-LINE-OF-DEFENSE identity guard. Empty-identity leads were appearing in
    // Leadim despite the _reentry safety net AND the pitch-level guards. We don't
    // fully know how — possibly a code path we haven't found, possibly a JS race,
    // possibly bots hitting cached pages. So we validate at the createLead call
    // itself: if name<2 chars or phone doesn't match the Israeli mobile pattern,
    // we return null IMMEDIATELY without POSTing to Leadim. This means: zero empty
    // leads can ever leave this function, regardless of caller bugs.
    var name  = String((payload && payload['form_fields[name]']) || '').trim();
    var phone = String((payload && payload['form_fields[phone]']) || '').trim().replace(/[\s\-]/g, '');
    if (name.length < 2 || !/^0\d{8,9}$/.test(phone)) {
      try {
        console.warn('[ymcs] createLead BLOCKED — invalid identity in payload', {
          lm_form: formCfg.lm_form, name: name, phone: phone,
          payload_keys: Object.keys(payload || {})
        });
      } catch (e) {}
      return Promise.resolve(null);
    }
    var url = LEADIM_CREATE + '?lm_form=' + formCfg.lm_form + '&lm_key=' + formCfg.lm_key + '&' + buildQuery(payload);
    return fetch(url, { method: 'POST' })
      .then(function (r) { return r.text(); })
      .then(function (t) { try { var j = JSON.parse(t); return j && j.result ? String(j.result) : null; } catch (e) { return null; } })
      .catch(function () { return null; });
  }

  function updateLead(leadId, fieldId, value, opts) {
    if (!leadId) return Promise.resolve();
    opts = opts || {};
    var body = new URLSearchParams();
    body.append('by_id', leadId);
    body.append('fld_179827', (typeof window !== 'undefined' && window.location ? window.location.hostname : ''));
    if (fieldId) body.append(fieldId, value == null ? '' : value);
    if (opts.routeAdv) body.append('route_adv', 'true');
    return fetch(LEADIM_UPDATE, {
      method: 'POST',
      headers: { 'X-LEAD-IM-AUTH': LEADIM_AUTH, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }).catch(function () {});
  }

  function scheduleRoute(leadId, reopen) {
    return fetch('/api/schedule-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, reopen: !!reopen })
    }).catch(function () {});
  }

  function markCompleted(leadId) {
    return fetch('/api/mark-completed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }), keepalive: true
    }).catch(function () {});
  }

  // Telecom CREATE payload — uses the exact field IDs specified by the user:
  // fld_179817 (name), fld_179818 (phone), fld_179819 (age), fld_179820 (email),
  // fld_179821 (city), fld_283259 (birthday), fld_377288 (consent),
  // fld_377286 (provider — set later via UPDATE). Sends both top-level and
  // form_fields[...] notation so the form receives the values regardless of
  // its server-side config. Also logs to console for diagnostics — if values
  // are empty when this runs, we'll see it in the browser's devtools.
  function buildTelecomCreatePayload(consent) {
    var name  = state.user.name  || '';
    var phone = state.user.phone || '';
    var age   = state.user.age   || '';
    var email = state.extra.email || '';
    var city  = state.extra.city || state.extra.cityName || '';
    var birth = state.extra.birthday || '';
    try {
      console.log('[ymcs] buildTelecomCreatePayload', {
        consent: consent, name: name, phone: phone, age: age,
        email: email, city: city, birthday: birth,
        state_user: state.user, state_extra: state.extra
      });
    } catch (e) {}
    var p = {
      // Top-level (Leadim contact-record identity)
      name:        name,
      phone:       phone,
      // Custom field IDs the user specified
      fld_179817:  name,
      fld_179818:  phone,
      fld_179819:  age,
      fld_179827:  (typeof window !== 'undefined' && window.location ? window.location.hostname : ''),
      // Employment status — set at the start of the cross-sell flow (fld_183161)
      fld_183161:  (typeof state !== 'undefined' && state.employmentStatus) || '',
      fld_377288:  consent || ''
    };
    if (email) p.fld_179820 = email;
    if (city)  p.fld_179821 = city;
    if (birth) p.fld_283259 = birth;
    // form_fields[...] mirror (Elementor convention used by forms 49491/49500)
    p['form_fields[name]']       = name;
    p['form_fields[phone]']      = phone;
    p['form_fields[fld_179817]'] = name;
    p['form_fields[fld_179818]'] = phone;
    p['form_fields[fld_179819]'] = age;
    if (typeof state !== 'undefined' && state.employmentStatus) p['form_fields[fld_183161]'] = state.employmentStatus;
    p['form_fields[fld_377288]'] = consent || '';
    if (email) p['form_fields[fld_179820]'] = email;
    if (city)  p['form_fields[fld_179821]'] = city;
    if (birth) p['form_fields[fld_283259]'] = birth;
    return p;
  }

  // ============ DOM utilities ============
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var root, card, progressBar;
  function injectStyles(cssHref) {
    if (document.getElementById('ymcs-css')) return;
    var link = document.createElement('link');
    link.id = 'ymcs-css'; link.rel = 'stylesheet'; link.href = cssHref || '/assets/cross-sell.css';
    document.head.appendChild(link);
  }
  function buildOverlay() {
    root = document.createElement('div');
    root.className = 'ymcs-overlay';
    root.innerHTML =
      '<div class="ymcs-shell">' +
        '<div class="ymcs-progress-wrap">' +
          '<div class="ymcs-encourage" id="ymcsEncourage" aria-live="polite"></div>' +
          '<div class="ymcs-progress"><div class="ymcs-progress-bar" id="ymcsProgressBar"></div></div>' +
          '<div class="ymcs-progress-pct" id="ymcsProgressPct" aria-hidden="true"></div>' +
        '</div>' +
        '<div class="ymcs-card" id="ymcsCard"></div>' +
      '</div>';
    document.body.appendChild(root);
    card = root.querySelector('#ymcsCard');
    progressBar = root.querySelector('#ymcsProgressBar');
  }

  // Encouragement messages — shown above the progress bar, change with completion %.
  // Keeps users moving through the long cross-sell flow by signaling tangible
  // progress and that they're closer to the end than they think.
  // Each message returns the {text, emoji, tone} for the current pct.
  function getEncouragement(pct) {
    if (pct < 12)  return { emoji: '🚀', text: 'בואו נתחיל — שאלות קצרות בלבד', tone: 'start' };
    if (pct < 28)  return { emoji: '✓',  text: 'כל הכבוד! המשך באותה הקצב',     tone: 'good' };
    if (pct < 42)  return { emoji: '⚡',  text: 'נהדר — אתה מתקדם יפה',          tone: 'good' };
    if (pct < 58)  return { emoji: '🎯', text: 'הגעת לחצי הדרך! כמה פרטים נוספים', tone: 'mid' };
    if (pct < 72)  return { emoji: '💪', text: 'מצוין! עוברים את שאלות האמצע',   tone: 'mid' };
    if (pct < 85)  return { emoji: '⏳', text: 'כמעט שם — שאלות אחרונות',         tone: 'near' };
    if (pct < 96)  return { emoji: '🏁', text: 'שאלה אחרונה ואז סיימת!',         tone: 'final' };
    return            { emoji: '🎉', text: 'סיימנו — מצוין!',                     tone: 'done' };
  }
  function show() {
    root.classList.add('is-open');
    // Hide every other top-level body child via the CSS rule scoped to
    // body.ymcs-locked. With the rest of the page display:none, the
    // overlay is the only thing in the render tree and can scroll the
    // document naturally — no position:fixed scroll-trap on iOS, no
    // z-index war with anything from the static markup.
    document.body.classList.add('ymcs-locked');
    window.scrollTo(0, 0);
  }

  function updateProgress(stepId) {
    var pct;
    if (stepId === '_reentry')                           { pct = 0; }
    else if (stepId === 'done' || stepId === 'telecom_done') { pct = 100; }
    else {
      var idx = stepIndex[stepId];
      pct = Math.max(2, Math.round((idx / Math.max(1, totalSteps - 1)) * 100));
    }
    progressBar.style.width = pct + '%';

    // Encouragement strip — keeps the user motivated through the long flow.
    // Hidden on _reentry (the pre-question gate) so it doesn't appear before flow starts.
    var enc = root.querySelector('#ymcsEncourage');
    var pctEl = root.querySelector('#ymcsProgressPct');
    if (enc) {
      if (stepId === '_reentry') {
        enc.classList.remove('show'); enc.innerHTML = '';
      } else {
        var msg = getEncouragement(pct);
        var prevTone = enc.getAttribute('data-tone');
        enc.setAttribute('data-tone', msg.tone);
        enc.innerHTML =
          '<span class="ymcs-encourage-emoji" aria-hidden="true">' + msg.emoji + '</span>' +
          '<span class="ymcs-encourage-text">' + escapeHtml(msg.text) + '</span>';
        enc.classList.add('show');
        // Re-trigger the entrance animation when the tone changes (transition into next phase)
        if (prevTone && prevTone !== msg.tone) {
          enc.classList.remove('bump');
          // force reflow so the animation restarts
          // eslint-disable-next-line no-unused-expressions
          enc.offsetWidth;
          enc.classList.add('bump');
        }
      }
    }
    if (pctEl) {
      pctEl.textContent = (stepId === '_reentry') ? '' : pct + '%';
    }
  }

  // ============ Templates ============
  // Pre-step shown only when name OR phone is missing at start() — prevents
  // empty-identity leads in Leadim. Two fields, validated, then resumes
  // the originally-intended pitch path.
  function tplReentry() {
    return '' +
      '<div class="ymcs-eyebrow">לפני שנמשיך</div>' +
      '<h2 class="ymcs-title">איך נחזור אליך?</h2>' +
      '<p class="ymcs-hint">כדי שנוכל להמשיך בבדיקה, נדרשים שני פרטים בסיסיים — שם וטלפון. נחזור אליך בהתאם תוך 24 שעות.</p>' +
      '<div class="ymcs-reentry-fields">' +
        '<div class="ymcs-field">' +
          '<label for="ymcsReName">שם מלא</label>' +
          '<input id="ymcsReName" class="ymcs-input" type="text" placeholder="לדוגמה: דני לוי" autocomplete="name" autocapitalize="words">' +
        '</div>' +
        '<div class="ymcs-field">' +
          '<label for="ymcsRePhone">מספר טלפון</label>' +
          '<input id="ymcsRePhone" class="ymcs-input" type="tel" placeholder="לדוגמה: 050-1234567" inputmode="tel" autocomplete="tel">' +
        '</div>' +
      '</div>' +
      '<div class="ymcs-error" id="ymcsReErr"></div>' +
      '<button class="ymcs-btn-primary" id="ymcsReSubmit">המשך לבדיקה</button>';
  }
  function tplPitchIns() {
    return '' +
      '<div class="ymcs-eyebrow">בונוס בלעדי</div>' +
      '<h2 class="ymcs-title">בדיקת תיק הביטוחים שלך — בחינם.</h2>' +
      '<p class="ymcs-hint">בדיקה חינמית של תיק הביטוח שלך יכולה לחסוך לך <strong>מאות שקלים בחודש</strong>. שירות מקצועי, ללא עלות וללא התחייבות — שווה כמה שאלות קצרות?</p>' +
      '<div class="ymcs-pitch-row">' +
        '<button class="ymcs-btn-primary" data-act="ins-yes">כן, אשמח לבדוק</button>' +
        '<button class="ymcs-btn-ghost"   data-act="ins-no">לא תודה, המשך</button>' +
      '</div>';
  }
  function tplPitchTax() {
    return '' +
      '<div class="ymcs-eyebrow">בונוס נוסף</div>' +
      '<h2 class="ymcs-title">המערכת זיהתה סיכוי גבוה לקבלת החזר מס!</h2>' +
      '<p class="ymcs-hint">רוב הישראלים מפספסים החזרי מס שמגיעים להם — לפעמים אלפי שקלים. שיחה ראשונית בלבד — מומחים יבדקו עבורך את הזכאות ויעשו עבורך את כל התהליך מול רשויות המס.</p>' +
      '<div class="ymcs-pitch-row">' +
        '<button class="ymcs-btn-primary" data-act="tax-yes">כן, אשמח לבדוק זכאות</button>' +
        '<button class="ymcs-btn-ghost"   data-act="tax-no">לא תודה, המשך</button>' +
      '</div>';
  }
  function tplPitchTelecom() {
    return '' +
      '<div class="ymcs-eyebrow">הצעה אחרונה — חד פעמית</div>' +
      '<h2 class="ymcs-title">חבל לשלם סתם — נציג מורשה יחסוך לך מאות שקלים על חבילת הטלוויזיה.</h2>' +
      '<p class="ymcs-hint">רוב המנויים בישראל משלמים יותר מדי על הטלוויזיה ולא יודעים שאפשר להוזיל או לשדרג ללא תוספת. <strong>בדיקה חינמית של נציג מורשה</strong> של אחת מחברות התקשורת המובילות — שווה לחסוך אלפי שקלים בשנה?</p>' +
      '<div class="ymcs-pitch-row">' +
        '<button class="ymcs-btn-primary" data-act="tel-yes">כן, אשמח לחסוך</button>' +
        '<button class="ymcs-btn-ghost"   data-act="tel-no">לא תודה, סיום</button>' +
      '</div>';
  }
  function tplTelecomProvider() {
    var providers = [
      'yes',
      'HOT',
      'סלקום TV',
      'פרטנר TV',
      'FREE TV',
      'STING+',
      'NEXT TV',
      'וואלה! FIBER',
      'גולן טלקום',
      'רמי לוי TV',
      'עידן פלוס',
      'אחר'
    ];
    return '' +
      '<h2 class="ymcs-title">מהו ספק שירותי הטלוויזיה הנוכחי שלך?</h2>' +
      '<p class="ymcs-hint">בחר את הספק שאצלו אתה משלם כיום — נציג מומחה ייצור איתך קשר עם הצעת ההוזלה.</p>' +
      '<div class="ymcs-telecom-grid">' +
        providers.map(function (name) {
          return '<button class="ymcs-telecom-btn" data-value="' + escapeHtml(name) + '">' +
                   '<span class="ymcs-telecom-name">' + escapeHtml(name) + '</span>' +
                 '</button>';
        }).join('') +
      '</div>';
  }
  function tplTelecomFinal() {
    return '' +
      '<div class="ymcs-final">' +
        '<div class="ymcs-final-icon" aria-hidden="true">✓</div>' +
        '<h2 class="ymcs-final-title">מצוין — נציג מחברת תקשורת יחזור אליך בקרוב.</h2>' +
        '<p class="ymcs-final-text">בנוסף לפניות הקודמות, נציג מורשה <strong>יחזור אליך תוך זמן קצר עם הצעה להוזלת חבילת הטלוויזיה</strong>. אתה מועבר כעת לדף הסיכום…</p>' +
      '</div>';
  }
  function tplInsurerPicker() {
    return '' +
      '<h2 class="ymcs-title">איזו חברת ביטוח תרצה שתחזור אליך לבדיקת תיק הביטוחים הפרטיים שלך?</h2>' +
      '<p class="ymcs-hint">בחר את החברה שאתה הכי מעוניין שתפנה אליך — נציג מומחה שלה ייצור איתך קשר.</p>' +
      '<div class="ymcs-insurer-grid">' +
        ['harel','phoenix','migdal','clal'].map(function (b) {
          var labels = { harel: 'הראל', phoenix: 'הפניקס', migdal: 'מגדל', clal: 'כלל' };
          return '<button class="ymcs-insurer-btn" data-brand="' + b + '" data-value="' + labels[b] + '">' +
            '<span class="ymcs-insurer-logo"><img src="/assets/insurance/' + b + '.png" alt="' + labels[b] + '" loading="lazy" onerror="this.style.display=\'none\'"></span>' +
            '<span class="ymcs-insurer-name">' + labels[b] + '</span>' +
            '</button>';
        }).join('') +
      '</div>' +
      '<button class="ymcs-skip" id="ymcsInsSkip" data-value="לא מעוניין בבדיקה של תיק הביטוח שלי">לא מעוניין בבדיקה של תיק הביטוח שלי</button>';
  }
  function tplYesNo(step) {
    return '' +
      '<h2 class="ymcs-title">' + escapeHtml(step.q) + '</h2>' +
      (step.hint ? '<p class="ymcs-hint">' + step.hint + '</p>' : '') +
      '<div class="ymcs-answers">' +
        '<button class="ymcs-answer-btn" data-answer="כן">כן</button>' +
        '<button class="ymcs-answer-btn" data-answer="לא">לא</button>' +
      '</div>';
  }
  function tplChoices(step) {
    var cls = step.options.length > 4 ? 'ymcs-answers is-stack' : 'ymcs-answers';
    return '' +
      '<h2 class="ymcs-title">' + escapeHtml(step.q) + '</h2>' +
      (step.hint ? '<p class="ymcs-hint">' + step.hint + '</p>' : '') +
      '<div class="' + cls + '">' +
        step.options.map(function (o) { return '<button class="ymcs-answer-btn" data-answer="' + escapeHtml(o) + '">' + escapeHtml(o) + '</button>'; }).join('') +
      '</div>';
  }
  function tplText(step) {
    return '' +
      '<h2 class="ymcs-title">' + escapeHtml(step.q) + '</h2>' +
      (step.hint ? '<p class="ymcs-hint">' + step.hint + '</p>' : '') +
      '<div class="ymcs-input-wrap"><input type="text" class="ymcs-input" id="ymcsTextInput" placeholder="' + escapeHtml(step.placeholder || '') + '"></div>' +
      '<div class="ymcs-error" id="ymcsTextErr"></div>' +
      '<button class="ymcs-btn-primary" id="ymcsTextSubmit">המשך</button>';
  }
  function tplMoney(step) {
    return '' +
      '<h2 class="ymcs-title">' + escapeHtml(step.q) + '</h2>' +
      (step.hint ? '<p class="ymcs-hint">' + step.hint + '</p>' : '') +
      '<div class="ymcs-input-wrap"><input type="text" inputmode="numeric" class="ymcs-input" id="ymcsMoneyInput" placeholder="' + escapeHtml(step.placeholder || '') + '"></div>' +
      '<div class="ymcs-error" id="ymcsMoneyErr"></div>' +
      '<button class="ymcs-btn-primary" id="ymcsMoneySubmit">המשך</button>';
  }
  function tplMulti(step) {
    return '' +
      '<h2 class="ymcs-title">' + escapeHtml(step.q) + '</h2>' +
      (step.hint ? '<p class="ymcs-hint">' + step.hint + '</p>' : '') +
      '<div class="ymcs-multi-grid" id="ymcsMultiGrid">' +
        step.options.map(function (o) { return '<button class="ymcs-multi-btn" data-value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</button>'; }).join('') +
      '</div>' +
      '<div class="ymcs-error" id="ymcsMultiErr"></div>' +
      '<button class="ymcs-btn-primary" id="ymcsMultiSubmit">המשך</button>';
  }
  function tplDate(step) {
    return '' +
      '<h2 class="ymcs-title">' + escapeHtml(step.q) + '</h2>' +
      (step.hint ? '<p class="ymcs-hint">' + step.hint + '</p>' : '') +
      '<div class="ymcs-input-wrap" style="max-width:280px"><input type="date" class="ymcs-input" id="ymcsDateInput"></div>' +
      '<div class="ymcs-error" id="ymcsDateErr"></div>' +
      '<button class="ymcs-btn-primary" id="ymcsDateSubmit">המשך</button>';
  }
  function tplTextOptional(step) {
    return '' +
      '<h2 class="ymcs-title">' + escapeHtml(step.q) + '</h2>' +
      (step.hint ? '<p class="ymcs-hint">' + step.hint + '</p>' : '') +
      '<div class="ymcs-answers">' +
        '<button class="ymcs-answer-btn" data-answer="כן" id="ymcsOptYes">כן</button>' +
        '<button class="ymcs-answer-btn" data-answer="לא" id="ymcsOptNo">לא</button>' +
      '</div>' +
      '<div class="ymcs-input-wrap" id="ymcsOptInputWrap" style="display:none"><input type="text" class="ymcs-input" id="ymcsOptInput" placeholder="' + escapeHtml(step.placeholder || '') + '"></div>' +
      '<div class="ymcs-error" id="ymcsOptErr"></div>' +
      '<button class="ymcs-btn-primary" id="ymcsOptSubmit" style="display:none">המשך</button>';
  }
  function tplFinal() {
    return '' +
      '<div class="ymcs-final">' +
        '<div class="ymcs-final-icon" aria-hidden="true">✓</div>' +
        '<h2 class="ymcs-final-title">תודה! פנייתך התקבלה.</h2>' +
        '<p class="ymcs-final-text">נציג מומחה יחזור אליך בהקדם עם הצעה מותאמת אישית. אתה מועבר כעת לדף הסיכום…</p>' +
      '</div>';
  }

  // ============ Render + transitions ============
  function backRow() {
    if (!state.history.length) return '';
    return '<div class="ymcs-back-row">' +
             '<button class="ymcs-back" type="button" id="ymcsBackBtn" aria-label="חזור לשלב הקודם">' +
               '<span class="ymcs-back-arrow" aria-hidden="true">→</span>' +
               '<span>חזור</span>' +
             '</button>' +
           '</div>';
  }

  function render(stepId, pushHistory) {
    var step = stepMap[stepId];
    if (!step) return;
    // Track step history for the back button. Forward transitions push the
    // outgoing step onto the stack; backwards transitions pass pushHistory=false
    // so they don't loop.
    if (pushHistory !== false && state.currentStep && state.currentStep !== stepId) {
      state.history.push(state.currentStep);
    }
    state.currentStep = stepId;
    updateProgress(stepId);
    var html;
    switch (step.type) {
      case 'reentry':           html = tplReentry();         break;
      case 'pitch_ins':         html = tplPitchIns();        break;
      case 'pitch_tax':         html = tplPitchTax();        break;
      case 'pitch_telecom':     html = tplPitchTelecom();    break;
      case 'insurer_picker':    html = tplInsurerPicker();   break;
      case 'telecom_provider':  html = tplTelecomProvider(); break;
      case 'yes_no':            html = tplYesNo(step);       break;
      case 'choices':           html = tplChoices(step);     break;
      case 'text':              html = tplText(step);        break;
      case 'money':             html = tplMoney(step);       break;
      case 'multi':             html = tplMulti(step);       break;
      case 'date':              html = tplDate(step);        break;
      case 'text_optional':     html = tplTextOptional(step);break;
      case 'final':             html = tplFinal();           break;
      case 'telecom_final':     html = tplTelecomFinal();    break;
      default: html = '';
    }
    // Back row is appended to every step except the entry pitch and the final
    // state — there's nowhere meaningful to go back to from those.
    if (!NO_BACK_STEPS[stepId]) html += backRow();
    card.innerHTML = html;
    // Scroll to top of the card
    root.scrollTop = 0;
    attachHandlers(step);

    if (step.type === 'final' || step.type === 'telecom_final') {
      setTimeout(function () {
        window.location.href = state.redirectOnComplete;
      }, 2400);
    }
  }

  function goBack() {
    if (!state.history.length) return;
    var prev = state.history.pop();
    render(prev, false);
  }

  // After saving the answer for the current step, advance.
  // If the step has fire_route_adv === activeFlow, fire route_adv + markCompleted on the active lead.
  function advance(step, value) {
    // Capture employment status on state — no lead exists yet at this point,
    // so it can't be sent via updateLead. It'll be attached to every createLead
    // payload downstream (insurance/tax/telecom).
    if (step.id === 'fld_183161') {
      state.employmentStatus = value;
    }

    var leadId = state.activeFlow === 'insurance' ? state.insuranceLeadId
               : state.activeFlow === 'tax'       ? state.taxLeadId
               : state.activeFlow === 'telecom'   ? state.telecomLeadId
               : null;
    var firingRouteAdv = (step.fire_route_adv === state.activeFlow);

    var sendP = step.fld && leadId
      ? updateLead(leadId, step.fld, value, { routeAdv: firingRouteAdv })
      : Promise.resolve();

    sendP.then(function () {
      if (firingRouteAdv && leadId) markCompleted(leadId);

      // next_fn lets a step decide its next dynamically based on state — used by
      // the employment-status step which branches to ins/tax pitch.
      var nextId = (typeof step.next_fn === 'function' && step.next_fn(state, value))
                || (step.conditional_next && step.conditional_next[value])
                || step.next;
      if (!nextId) { render('done'); return; }

      // Transition into tax flow when crossing the pitch_tax boundary
      if (nextId === 'pitch_tax' && state.activeFlow !== 'tax') {
        state.activeFlow = null; // we'll set 'tax' only on tax-pitch yes
      }
      render(nextId);
    });
  }

  function attachHandlers(step) {
    // Wire the back link first — it appears on every step except pitch_ins
    // and final. The attachHandlers function has many early returns per step
    // type, so we attach the back handler up here before any of them.
    var backBtn = card.querySelector('#ymcsBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', function (e) {
        e.preventDefault();
        goBack();
      });
    }

    if (step.type === 'reentry') {
      var reName  = card.querySelector('#ymcsReName');
      var rePhone = card.querySelector('#ymcsRePhone');
      var reErr   = card.querySelector('#ymcsReErr');
      var reBtn   = card.querySelector('#ymcsReSubmit');
      // Pre-fill whichever field we already had (e.g. only one was missing).
      if (state.user.name)  reName.value  = state.user.name;
      if (state.user.phone) rePhone.value = state.user.phone;
      function reSubmit(e) {
        if (e) e.preventDefault();
        var n = (reName.value  || '').trim();
        var p = (rePhone.value || '').trim().replace(/[\s-]/g, '');
        var phoneOk = /^0\d{8,9}$/.test(p);
        if (!n || n.length < 2) { reErr.textContent = 'נא להזין שם מלא';           reName.focus();  return; }
        if (!phoneOk)           { reErr.textContent = 'נא להזין מספר טלפון תקין'; rePhone.focus(); return; }
        reErr.textContent = '';
        reBtn.disabled = true;
        state.user.name  = n;
        state.user.phone = p;
        writeStoredUser(state.user);
        // Reset history so the user can't "back" into this pre-step from later
        state.history = [];
        render(state._postReentryStart || 'pitch_tax', false);
      }
      reBtn.addEventListener('click', reSubmit);
      rePhone.addEventListener('keydown', function (e) { if (e.key === 'Enter') reSubmit(e); });
      reName .addEventListener('keydown', function (e) { if (e.key === 'Enter') rePhone.focus(); });
      return;
    }
    if (step.type === 'pitch_ins') {
      card.querySelector('[data-act="ins-yes"]').addEventListener('click', function (e) {
        e.preventDefault();
        var self = this;
        self.disabled = true;
        // CRITICAL: never POST an empty-identity lead to Leadim. If state.user
        // somehow doesn't have a valid name+phone at this point, route to
        // re-entry to collect them instead of creating a hollow Leadim record.
        if (!state.user.name || !/^0\d{8,9}$/.test(state.user.phone || '')) {
          try { console.warn('[ymcs] pitch_ins blocked: missing identity', {user: state.user, opts: state}); } catch (e) {}
          state._postReentryStart = 'pitch_ins';
          self.disabled = false;
          render('_reentry');
          return;
        }
        // Create the insurance lead now (we'll update it field by field)
        var payload = {
          'form_fields[name]': state.user.name,
          'form_fields[phone]': state.user.phone,
          'form_fields[age]': state.user.age
        };
        if (state.employmentStatus) payload['form_fields[fld_183161]'] = state.employmentStatus;
        if (state.extra.incomeNis) payload['form_fields[fld_262192]'] = state.extra.incomeNis;
        createLead(INSURANCE_FORM, payload).then(function (leadId) {
          if (leadId) {
            state.insuranceLeadId = leadId;
            state.activeFlow = 'insurance';
            scheduleRoute(leadId);
          }
          render('fld_351761');
        });
      });
      card.querySelector('[data-act="ins-no"]').addEventListener('click', function (e) {
        e.preventDefault();
        // No insurance lead created — go straight to tax pitch
        render('pitch_tax');
      });
      return;
    }
    if (step.type === 'pitch_tax') {
      card.querySelector('[data-act="tax-yes"]').addEventListener('click', function (e) {
        e.preventDefault();
        var self = this;
        self.disabled = true;
        if (!state.user.name || !/^0\d{8,9}$/.test(state.user.phone || '')) {
          try { console.warn('[ymcs] pitch_tax blocked: missing identity', {user: state.user}); } catch (e) {}
          state._postReentryStart = 'pitch_tax';
          self.disabled = false;
          render('_reentry');
          return;
        }
        var payload = {
          'form_fields[name]': state.user.name,
          'form_fields[phone]': state.user.phone,
          'form_fields[age]': state.user.age
        };
        if (state.employmentStatus) payload['form_fields[fld_183161]'] = state.employmentStatus;
        if (state.extra.incomeNis) payload['form_fields[fld_262192]'] = state.extra.incomeNis;
        createLead(TAX_FORM, payload).then(function (leadId) {
          if (leadId) {
            state.taxLeadId = leadId;
            state.activeFlow = 'tax';
            scheduleRoute(leadId);
          }
          render('t_halat');
        });
      });
      card.querySelector('[data-act="tax-no"]').addEventListener('click', function (e) {
        e.preventDefault();
        // Tax declined — but telecom is still offered. Reset activeFlow so
        // advance() doesn't try to write to a nonexistent tax lead.
        state.activeFlow = null;
        render('pitch_telecom');
      });
      return;
    }
    if (step.type === 'pitch_telecom') {
      card.querySelector('[data-act="tel-yes"]').addEventListener('click', function (e) {
        e.preventDefault();
        var btn = this; btn.disabled = true;
        if (!state.user.name || !/^0\d{8,9}$/.test(state.user.phone || '')) {
          try { console.warn('[ymcs] pitch_telecom blocked: missing identity', {user: state.user}); } catch (e) {}
          state._postReentryStart = 'pitch_telecom';
          btn.disabled = false;
          render('_reentry');
          return;
        }
        var payload = buildTelecomCreatePayload('כן');
        createLead(TELECOM_FORM, payload).then(function (leadId) {
          if (leadId) {
            state.telecomLeadId = leadId;
            state.activeFlow = 'telecom';
            // Safety-net cron will fire route_adv if the user abandons before
            // picking a provider. fld_377288='כן' means consent given, so
            // routing on timeout is the right behavior.
            scheduleRoute(leadId);
          }
          render('fld_377286');
        });
      });
      card.querySelector('[data-act="tel-no"]').addEventListener('click', function (e) {
        e.preventDefault();
        this.disabled = true;
        // Opt-out: user declined the telecom offer.
        // PER USER REQUEST (2026-05-21): do NOT create a Leadim lead at all here.
        // Previously we created a lead with fld_377288='לא' "for analytics", but in
        // practice it flooded the advertiser's Leadim with hundreds of irrelevant
        // opt-out entries. Now: end silently, no lead, no reporting noise.
        render('done');
      });
      return;
    }
    if (step.type === 'telecom_provider') {
      Array.prototype.forEach.call(card.querySelectorAll('.ymcs-telecom-btn'), function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          if (btn.classList.contains('is-busy')) return;
          Array.prototype.forEach.call(card.querySelectorAll('.ymcs-telecom-btn'), function (b) {
            b.classList.add('is-busy');
          });
          btn.classList.add('is-selected');
          state.activeFlow = 'telecom';
          var val = btn.getAttribute('data-value');
          if (val === 'אחר') {
            // Save the partial answer (so the lead reflects the click), but
            // DON'T fire route_adv yet — we need the actual provider name from
            // the text input before routing to the advertiser.
            if (state.telecomLeadId) updateLead(state.telecomLeadId, 'fld_377286', 'אחר');
            render('fld_377286_other');
          } else {
            // Known provider — fire route_adv on this single update and finish.
            var leadId = state.telecomLeadId;
            var sendP = leadId ? updateLead(leadId, 'fld_377286', val, { routeAdv: true }) : Promise.resolve();
            sendP.then(function () {
              if (leadId) markCompleted(leadId);
              render('telecom_done');
            });
          }
        });
      });
      return;
    }
    if (step.type === 'insurer_picker') {
      Array.prototype.forEach.call(card.querySelectorAll('.ymcs-insurer-btn'), function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          if (btn.classList.contains('is-busy')) return;
          Array.prototype.forEach.call(card.querySelectorAll('.ymcs-insurer-btn'), function (b) { b.classList.add('is-busy'); });
          var val = btn.getAttribute('data-value');
          // Ensure activeFlow is insurance even if user pressed back after opt-out
          state.activeFlow = 'insurance';
          if (state.insuranceOptedOut && state.insuranceLeadId) {
            scheduleRoute(state.insuranceLeadId, true);
            state.insuranceOptedOut = false;
          }
          advance(step, val);
        });
      });
      var skip = card.querySelector('#ymcsInsSkip');
      if (skip) skip.addEventListener('click', function (e) {
        e.preventDefault();
        skip.disabled = true;
        var val = skip.getAttribute('data-value');
        // Save the answer, mark insurance lead completed, jump to tax pitch
        var leadId = state.insuranceLeadId;
        var sendP = leadId ? updateLead(leadId, step.fld, val) : Promise.resolve();
        sendP.then(function () {
          if (leadId) markCompleted(leadId);
          state.activeFlow = null;
          state.insuranceOptedOut = true;
          render('pitch_tax');
        });
      });
      return;
    }
    if (step.type === 'yes_no' || step.type === 'choices') {
      Array.prototype.forEach.call(card.querySelectorAll('.ymcs-answer-btn'), function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          if (btn.disabled) return;
          Array.prototype.forEach.call(card.querySelectorAll('.ymcs-answer-btn'), function (b) { b.disabled = true; });
          btn.classList.add('is-selected');
          advance(step, btn.getAttribute('data-answer'));
        });
      });
      return;
    }
    if (step.type === 'text') {
      var input = card.querySelector('#ymcsTextInput');
      var err = card.querySelector('#ymcsTextErr');
      var submit = card.querySelector('#ymcsTextSubmit');
      submit.addEventListener('click', function (e) {
        e.preventDefault();
        var v = input.value.trim();
        if (!v) { err.textContent = 'נא לפרט'; return; }
        err.textContent = ''; submit.disabled = true;
        advance(step, v);
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit.click(); });
      return;
    }
    if (step.type === 'money') {
      var minput = card.querySelector('#ymcsMoneyInput');
      var merr = card.querySelector('#ymcsMoneyErr');
      var msubmit = card.querySelector('#ymcsMoneySubmit');
      minput.addEventListener('input', function () { minput.value = minput.value.replace(/[^\d,]/g, ''); });
      msubmit.addEventListener('click', function (e) {
        e.preventDefault();
        var raw = minput.value.replace(/[^\d]/g, '');
        if (!raw) { merr.textContent = 'יש להזין סכום תקין'; return; }
        merr.textContent = ''; msubmit.disabled = true;
        var formatted = Number(raw).toLocaleString() + ' ₪';
        advance(step, formatted);
      });
      minput.addEventListener('keydown', function (e) { if (e.key === 'Enter') msubmit.click(); });
      return;
    }
    if (step.type === 'multi') {
      var grid = card.querySelector('#ymcsMultiGrid');
      var mmerr = card.querySelector('#ymcsMultiErr');
      var mmsubmit = card.querySelector('#ymcsMultiSubmit');
      grid.addEventListener('click', function (e) {
        var b = e.target.closest('.ymcs-multi-btn');
        if (!b) return;
        e.preventDefault();
        b.classList.toggle('is-selected');
      });
      mmsubmit.addEventListener('click', function (e) {
        e.preventDefault();
        var values = [];
        Array.prototype.forEach.call(grid.querySelectorAll('.ymcs-multi-btn.is-selected'), function (b) {
          values.push(b.getAttribute('data-value'));
        });
        if (!values.length) { mmerr.textContent = 'נא לבחור לפחות אפשרות אחת'; return; }
        mmerr.textContent = ''; mmsubmit.disabled = true;
        advance(step, values.join(', '));
      });
      return;
    }
    if (step.type === 'date') {
      var dinput = card.querySelector('#ymcsDateInput');
      var derr = card.querySelector('#ymcsDateErr');
      var dsubmit = card.querySelector('#ymcsDateSubmit');
      dsubmit.addEventListener('click', function (e) {
        e.preventDefault();
        if (!dinput.value) { derr.textContent = 'נא לבחור תאריך'; return; }
        derr.textContent = ''; dsubmit.disabled = true;
        advance(step, dinput.value);
      });
      return;
    }
    if (step.type === 'text_optional') {
      var inputWrap = card.querySelector('#ymcsOptInputWrap');
      var otext = card.querySelector('#ymcsOptInput');
      var oerr = card.querySelector('#ymcsOptErr');
      var osubmit = card.querySelector('#ymcsOptSubmit');
      var oyes = card.querySelector('#ymcsOptYes');
      var ono = card.querySelector('#ymcsOptNo');
      oyes.addEventListener('click', function (e) {
        e.preventDefault();
        oyes.classList.add('is-selected'); ono.classList.remove('is-selected');
        inputWrap.style.display = 'block';
        osubmit.style.display = 'block';
        setTimeout(function () { otext.focus(); }, 60);
      });
      ono.addEventListener('click', function (e) {
        e.preventDefault();
        ono.classList.add('is-selected'); oyes.classList.remove('is-selected');
        oyes.disabled = true; ono.disabled = true;
        advance(step, 'לא');
      });
      osubmit.addEventListener('click', function (e) {
        e.preventDefault();
        var v = otext.value.trim();
        if (!v) { oerr.textContent = 'נא לפרט את המקורות'; return; }
        oerr.textContent = ''; osubmit.disabled = true; oyes.disabled = true; ono.disabled = true;
        advance(step, 'כן: ' + v);
      });
      return;
    }
  }

  // Shared identity setup — used by both public entry points.
  function bootstrapIdentity(opts) {
    state.user = { name: opts.name || '', phone: opts.phone || '', age: opts.age || '' };
    state.extra = opts.extra || {};
    state.redirectOnComplete = opts.redirectOnComplete || '/';
    if (!state.user.name || !state.user.phone) {
      var stored = readStoredUser();
      if (stored) {
        state.user.name  = state.user.name  || stored.name  || '';
        state.user.phone = state.user.phone || stored.phone || '';
        state.user.age   = state.user.age   || stored.age   || '';
      }
    }
    writeStoredUser(state.user);
  }

  // ============ Public API ============
  window.YMediaCrossSell = {
    // Full insurance+tax+telecom flow — entry point for dormant-funds sites.
    start: function (opts) {
      opts = opts || {};
      bootstrapIdentity(opts);
      // The cross-sell flow now opens with the employment-status question
      // (fld_183161). The pitch (ins or tax) follows: insurance pitch is gated
      // on fld_282715='כן' from the host quiz, tax is the fallback.
      // If identity is missing, show the re-entry mini-form first to avoid
      // empty-identity leads in Leadim.
      state._postEmploymentNext = (opts.insurancePay === 'כן') ? 'pitch_ins' : 'pitch_tax';
      // If the host page already asked the employment-status question (in its
      // /thanks/ intake quiz) and is passing the answer in, skip our inline step.
      // Otherwise, fall back to asking inside the cross-sell overlay.
      if (opts.employmentStatus) {
        state.employmentStatus = opts.employmentStatus;
      }
      var intendedStart = state.employmentStatus ? state._postEmploymentNext : 'fld_183161';
      var hasIdentity = !!state.user.name && !!state.user.phone;
      state._postReentryStart = intendedStart;

      injectStyles(opts.cssHref);
      if (!root) buildOverlay();
      show();
      render(hasIdentity ? intendedStart : '_reentry');
    },
    // Telecom-only entry — for loan-vertical sites that already ran their own
    // inline insurance + tax cross-sell. Skips straight to pitch_telecom so
    // the user isn't re-pitched insurance/tax. Same overlay + identity recovery
    // as start(). The host should call this in place of its final redirect.
    startTelecomOnly: function (opts) {
      opts = opts || {};
      bootstrapIdentity(opts);
      var hasIdentity = !!state.user.name && !!state.user.phone;
      state._postReentryStart = 'pitch_telecom';

      injectStyles(opts.cssHref);
      if (!root) buildOverlay();
      show();
      render(hasIdentity ? 'pitch_telecom' : '_reentry');
    }
  };
})();
