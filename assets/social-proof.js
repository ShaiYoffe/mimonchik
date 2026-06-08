/* social-proof v2 2026-06-08 — smart "recent success" popup, category=loans.
 *
 * Safety contract:
 *   - Self-contained (injects own CSS, no external dependencies).
 *   - Swallows every error — never throws into the page or breaks the form.
 *   - Generic .ymsp class names — no collisions with form CSS.
 *   - Appends to <html>, not <body>, to escape body.transform stacking
 *     context (canonical mobile-overflow guard) which would otherwise pin
 *     the popup to the page bottom instead of the viewport.
 *   - All event listeners are passive — never preventDefault, never bubble.
 *   - One per session via sessionStorage flag 'ymsp_shown_v1'.
 *   - ?sp=force in URL bypasses both flag + timer (testing aid).
 *
 * Trigger logic — fires when ALL of these are true:
 *   1. Page loaded ≥ 10 seconds.
 *   2. Hasn't already shown in this session.
 *   3. User is NOT currently typing in a form field.
 *   4. User is on the homepage (location.pathname === '/').
 *
 * Auto-dismisses after 7 seconds. Close button always available.
 */
(function () {
  'use strict';

  function __log(msg, extra) {
    try { console.log('[social-proof] ' + msg, extra === undefined ? '' : extra); } catch (e) {}
  }

  var __force = false;
  try {
    var __qp = new URLSearchParams(location.search);
    __force = (__qp.get('sp') === 'force');
  } catch (e) {}

  try {
    if (!__force && sessionStorage.getItem('ymsp_shown_v1') === '1') return;
  } catch (e) {}

  var VARIANTS = [
    { initial:'ע. מ.', city:'ירושלים', amount:95000, desc:'הצעה משופרת ללא עמלות', mins:3 },
    { initial:'ש. א.', city:'תל אביב', amount:150000, desc:'אישור מהיר תוך 24 שעות', mins:7 },
    { initial:'ד. ה.', city:'חיפה', amount:220000, desc:'מסלול איחוד הלוואות', mins:12 },
    { initial:'מ. ב.', city:'באר שבע', amount:45000, desc:'בריבית מועדפת', mins:5 },
    { initial:'א. כ.', city:'אשדוד', amount:75000, desc:'ללא בטחונות', mins:9 },
    { initial:'ר. ל.', city:'נתניה', amount:110000, desc:'לצורך שיפוץ ושדרוג', mins:4 },
    { initial:'י. פ.', city:'פתח תקווה', amount:180000, desc:'במסלול עצמאים', mins:11 },
    { initial:'ל. ש.', city:'ראשון לציון', amount:65000, desc:'לאיחוד חובות בנקאיים', mins:6 },
    { initial:'ח. ט.', city:'רחובות', amount:130000, desc:'כנגד רכב בבעלות', mins:8 },
    { initial:'נ. ז.', city:'חולון', amount:200000, desc:'לרכישת רכב', mins:10 }
  ];

  // Pick by minute-bucket so back-to-back same-minute visits see one variant
  // (less obviously random), but rotates over time.
  var idx = Math.floor(Date.now() / 60000) % VARIANTS.length;
  var pick = VARIANTS[idx];
  var ACTION = 'אושרה לו הלוואה של';

  function injectStyles() {
    if (document.getElementById('ymsp-styles')) return;
    var css = ''
      + '.ymsp { position: fixed; bottom: 90px; right: 16px; z-index: 2147483600; '
      + '  max-width: 340px; background: #fff; border: 1px solid rgba(22,163,74,0.20); '
      + '  border-radius: 14px; box-shadow: 0 12px 32px -8px rgba(15,109,94,0.25); '
      + '  padding: 14px 16px 14px 14px; font-family: "Heebo", system-ui, sans-serif; '
      + '  direction: rtl; text-align: right; transform: translateX(120%); '
      + '  transition: transform .35s cubic-bezier(.22,.61,.36,1); pointer-events: auto; }'
      + '.ymsp.is-visible { transform: translateX(0); }'
      + '.ymsp.is-leaving  { transform: translateX(120%); }'
      + '.ymsp__row { display: flex; align-items: flex-start; gap: 12px; }'
      + '.ymsp__avatar { flex: 0 0 auto; width: 40px; height: 40px; border-radius: 50%; '
      + '  background: linear-gradient(135deg, #1DDF42, #16A34A); color: #fff; '
      + '  display: inline-flex; align-items: center; justify-content: center; '
      + '  font-weight: 800; font-size: 18px; line-height: 1; }'
      + '.ymsp__body { flex: 1 1 auto; min-width: 0; }'
      + '.ymsp__title { font-size: 13.5px; font-weight: 700; color: #0F1620; line-height: 1.35; margin: 0 0 4px; }'
      + '.ymsp__title strong { color: #15803D; }'
      + '.ymsp__meta { font-size: 12px; color: #475569; line-height: 1.4; margin: 0; }'
      + '.ymsp__time { display: inline-flex; align-items: center; gap: 4px; '
      + '  font-size: 11px; color: #16A34A; font-weight: 600; margin-top: 4px; }'
      + '.ymsp__time::before { content: "●"; font-size: 7px; line-height: 1; }'
      + '.ymsp__close { position: absolute; top: 6px; left: 6px; '
      + '  width: 22px; height: 22px; border: 0; background: transparent; '
      + '  color: #94a3b8; font-size: 17px; line-height: 1; cursor: pointer; '
      + '  border-radius: 50%; transition: background .15s; padding: 0; }'
      + '.ymsp__close:hover { background: #f1f5f9; color: #334155; }'
      + '@media (max-width: 480px) {'
      + '  .ymsp { left: 12px; right: 12px; max-width: none; bottom: 80px; }'
      + '}';
    var style = document.createElement('style');
    style.id = 'ymsp-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function show() {
    try {
      injectStyles();
      if (document.getElementById('ymsp-toast')) return;
      var amountFormatted = '₪' + Math.round(pick.amount).toLocaleString();
      var html = ''
        + '<button class="ymsp__close" type="button" aria-label="סגור">×</button>'
        + '<div class="ymsp__row">'
        +   '<div class="ymsp__avatar" aria-hidden="true">✓</div>'
        +   '<div class="ymsp__body">'
        +     '<p class="ymsp__title">' + esc(pick.initial) + ' מ' + esc(pick.city) + ' — '
        +       esc(ACTION) + ' <strong>' + amountFormatted + '</strong></p>'
        +     '<p class="ymsp__meta">' + esc(pick.desc) + '</p>'
        +     '<span class="ymsp__time">לפני ' + pick.mins + ' דקות</span>'
        +   '</div>'
        + '</div>';
      var el = document.createElement('div');
      el.className = 'ymsp';
      el.id = 'ymsp-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML = html;
      // Append to <html>, NOT <body>. body has transform:translateZ(0) per the
      // canonical mobile-overflow guard, which breaks position:fixed inside it.
      document.documentElement.appendChild(el);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { el.classList.add('is-visible'); });
      });
      try { sessionStorage.setItem('ymsp_shown_v1', '1'); } catch (e) {}
      var closeBtn = el.querySelector('.ymsp__close');
      if (closeBtn) closeBtn.addEventListener('click', dismiss);
      setTimeout(dismiss, 7000);
      function dismiss() {
        if (!el || !el.parentNode) return;
        el.classList.remove('is-visible');
        el.classList.add('is-leaving');
        setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 380);
      }
    } catch (e) {
      __log('render failed', e);
    }
  }

  function userIsTyping() {
    var ae = document.activeElement;
    if (!ae) return false;
    var tag = (ae.tagName || '').toUpperCase();
    return (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable);
  }

  function isHomepage() {
    var path = (location.pathname || '').toLowerCase();
    return path === '/' || path === '/index.html' || path === '';
  }

  if (!isHomepage()) return;

  var triggered = false;
  function maybeTrigger(reason) {
    if (triggered || userIsTyping()) return;
    triggered = true;
    show();
  }

  if (__force) {
    setTimeout(show, 300);
    return;
  }

  setTimeout(function () { maybeTrigger('10s timer'); }, 10000);

  document.addEventListener('mouseout', function (e) {
    if (!e.toElement && !e.relatedTarget && e.clientY <= 0) maybeTrigger('exit-intent');
  }, { passive: true });

  var scrolled40 = false;
  var idleTimer = null;
  function resetIdleTimer() {
    if (triggered) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { maybeTrigger('scroll+idle'); }, 8000);
  }
  window.addEventListener('scroll', function () {
    if (!scrolled40 && !triggered) {
      var max = (document.documentElement.scrollHeight - window.innerHeight);
      if (max > 0 && window.scrollY > max * 0.40) { scrolled40 = true; resetIdleTimer(); }
    } else if (scrolled40) {
      resetIdleTimer();
    }
  }, { passive: true });
  document.addEventListener('mousemove', function () { if (scrolled40) resetIdleTimer(); }, { passive: true });
  document.addEventListener('keydown',   function () { if (scrolled40) resetIdleTimer(); }, { passive: true });
})();
