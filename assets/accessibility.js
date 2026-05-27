/*!
 * Accessibility Widget (2026-05-27) — Israeli law-compliant accessibility menu.
 * Standard: IS 5568 AA + WCAG 2.0 AA.
 * Self-contained: no external dependencies, no tracking, no network calls.
 * Settings persist in localStorage. RTL-first design.
 */
(function () {
  'use strict';
  if (window.__a11yWidgetLoaded) return;
  window.__a11yWidgetLoaded = true;

  // ─── CSS ──────────────────────────────────────────────────────────
  var css = ''
    + '.a11y-fab{position:fixed;bottom:18px;left:18px;width:46px;height:46px;border-radius:50%;background:#1D4ED8;color:#fff;border:2px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer;z-index:2147483647;display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s,bottom .25s ease;padding:0}'
    + 'html.cc-active .a11y-fab{bottom:70px}'
    + 'html.cc-active .a11y-panel{bottom:128px}'
    + '.a11y-fab:hover{transform:scale(1.08);box-shadow:0 6px 20px rgba(0,0,0,.4)}'
    + '.a11y-fab:focus-visible{outline:3px solid #FCD34D;outline-offset:3px}'
    + '.a11y-fab svg{width:24px;height:24px;fill:#fff}'
    + '.a11y-panel{position:fixed;bottom:78px;left:18px;width:340px;max-width:calc(100vw - 36px);background:#fff;color:#111;border-radius:14px;box-shadow:0 12px 48px rgba(0,0,0,.3);z-index:2147483647;direction:rtl;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Heebo,Assistant,Arial,sans-serif;font-size:14px;display:none;max-height:calc(100vh - 110px);overflow-y:auto;line-height:1.4}'
    + '.a11y-panel.is-open{display:block;animation:a11yFadeIn .2s ease-out}'
    + '@keyframes a11yFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}'
    + '.a11y-panel-header{padding:14px 18px;background:#1D4ED8;color:#fff;border-radius:14px 14px 0 0;display:flex;justify-content:space-between;align-items:center}'
    + '.a11y-panel-header h3{margin:0;font-size:16px;font-weight:700;color:#fff}'
    + '.a11y-close{background:transparent;color:#fff;border:0;font-size:28px;cursor:pointer;padding:0;line-height:1;width:32px;height:32px;border-radius:50%}'
    + '.a11y-close:hover{background:rgba(255,255,255,.15)}'
    + '.a11y-close:focus-visible{outline:2px solid #FCD34D}'
    + '.a11y-panel-body{padding:16px 18px}'
    + '.a11y-controls{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}'
    + '.a11y-btn{padding:12px 8px;border:1.5px solid #E5E7EB;background:#fff;color:#111;font-size:13px;font-weight:600;border-radius:8px;cursor:pointer;text-align:center;transition:all .15s;font-family:inherit;line-height:1.2;display:flex;flex-direction:column;align-items:center;gap:4px}'
    + '.a11y-btn:hover{background:#F3F4F6;border-color:#1D4ED8}'
    + '.a11y-btn:focus-visible{outline:2px solid #1D4ED8;outline-offset:2px}'
    + '.a11y-btn.is-active{background:#1D4ED8;color:#fff;border-color:#1D4ED8}'
    + '.a11y-btn .a11y-icon{font-size:18px;line-height:1}'
    + '.a11y-reset{width:100%;padding:11px;background:transparent;color:#DC2626;border:1.5px solid #DC2626;border-radius:8px;cursor:pointer;font-weight:700;font-size:13.5px;font-family:inherit}'
    + '.a11y-reset:hover{background:#DC2626;color:#fff}'
    + '.a11y-reset:focus-visible{outline:2px solid #1D4ED8;outline-offset:2px}'
    + '.a11y-footer{padding:12px 18px;border-top:1px solid #E5E7EB;font-size:12.5px;color:#6B7280;text-align:center}'
    + '.a11y-footer a{color:#1D4ED8;text-decoration:underline;font-weight:600}'

    // Body modifier classes — applied via JS
    // Text scaling via zoom — works universally across all text elements
    // (font-size on body doesn't cascade because most elements have their own
    // font-size set). zoom is non-standard but supported in all modern browsers
    // including Firefox since v126.
    + 'body.a11y-text-large{zoom:1.10}'
    + 'body.a11y-text-larger{zoom:1.22}'
    + 'body.a11y-text-largest{zoom:1.36}'
    // Fallback for older Firefox — use transform: scale (less ideal but works)
    + '@supports not (zoom: 1) { body.a11y-text-large{transform:scale(1.10);transform-origin:top center} body.a11y-text-larger{transform:scale(1.22);transform-origin:top center} body.a11y-text-largest{transform:scale(1.36);transform-origin:top center} }'
    + 'body.a11y-high-contrast{background:#000 !important;color:#fff !important}'
    + 'body.a11y-high-contrast *{background-color:#000 !important;color:#fff !important;border-color:#fff !important;text-shadow:none !important}'
    + 'body.a11y-high-contrast a,body.a11y-high-contrast a *{color:#FCD34D !important}'
    + 'body.a11y-high-contrast img,body.a11y-high-contrast video{opacity:.85}'
    + 'body.a11y-high-contrast .a11y-panel,body.a11y-high-contrast .a11y-panel *{background-color:#fff !important;color:#000 !important;border-color:#1D4ED8 !important}'
    + 'body.a11y-high-contrast .a11y-panel-header,body.a11y-high-contrast .a11y-panel-header *{background-color:#1D4ED8 !important;color:#fff !important}'
    + 'body.a11y-grayscale{filter:grayscale(100%)}'
    + 'body.a11y-grayscale .a11y-fab,body.a11y-grayscale .a11y-panel{filter:grayscale(0)}'
    + 'body.a11y-highlight-links a{outline:2px solid #F59E0B !important;outline-offset:2px !important;text-decoration:underline !important}'
    + 'body.a11y-no-animations *,body.a11y-no-animations *::before,body.a11y-no-animations *::after{animation-duration:.001s !important;transition-duration:.001s !important;animation-iteration-count:1 !important;scroll-behavior:auto !important}'
    + 'body.a11y-readable-font *:not(.a11y-fab):not(.a11y-fab *){font-family:Arial,Verdana,sans-serif !important;letter-spacing:.3px !important;word-spacing:1px !important}'
    + '@media (max-width:480px){.a11y-fab{width:42px;height:42px;bottom:14px;left:14px}.a11y-fab svg{width:22px;height:22px}.a11y-panel{left:14px;bottom:64px;width:calc(100vw - 28px)}html.cc-active .a11y-fab{bottom:80px}html.cc-active .a11y-panel{bottom:130px}}';

  // ─── HTML (SVG icon: universal accessibility person) ──────────────
  var iconSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="3.5" r="2"/><path d="M16 6.5h-8c-.55 0-1 .45-1 1s.45 1 1 1h2.5v9c0 .55.45 1 1 1s1-.45 1-1V14h1v3.5c0 .55.45 1 1 1s1-.45 1-1v-9H16c.55 0 1-.45 1-1s-.45-1-1-1z"/></svg>';

  var html = ''
    + '<button class="a11y-fab" id="a11yFab" aria-label="פתח תפריט נגישות" title="נגישות">' + iconSVG + '</button>'
    + '<div class="a11y-panel" role="dialog" aria-label="תפריט נגישות" id="a11yPanel">'
    + '  <div class="a11y-panel-header">'
    + '    <h3>♿ תפריט נגישות</h3>'
    + '    <button class="a11y-close" aria-label="סגור תפריט" id="a11yClose">&times;</button>'
    + '  </div>'
    + '  <div class="a11y-panel-body">'
    + '    <div class="a11y-controls">'
    + '      <button class="a11y-btn" data-action="text-larger"><span class="a11y-icon">🔍</span>הגדל טקסט</button>'
    + '      <button class="a11y-btn" data-action="text-smaller"><span class="a11y-icon">🔎</span>הקטן טקסט</button>'
    + '      <button class="a11y-btn" data-toggle="a11y-high-contrast"><span class="a11y-icon">◐</span>ניגודיות גבוהה</button>'
    + '      <button class="a11y-btn" data-toggle="a11y-grayscale"><span class="a11y-icon">○</span>גוון אפור</button>'
    + '      <button class="a11y-btn" data-toggle="a11y-highlight-links"><span class="a11y-icon">🔗</span>הדגש קישורים</button>'
    + '      <button class="a11y-btn" data-toggle="a11y-no-animations"><span class="a11y-icon">⏸</span>עצור אנימציות</button>'
    + '      <button class="a11y-btn" data-toggle="a11y-readable-font" style="grid-column:1 / -1"><span class="a11y-icon">📖</span>פונט קריא</button>'
    + '    </div>'
    + '    <button class="a11y-reset" id="a11yReset">↻ איפוס הגדרות נגישות</button>'
    + '  </div>'
    + '  <div class="a11y-footer">'
    + '    <a href="/accessibility-statement/">📋 הצהרת נגישות</a>'
    + '  </div>'
    + '</div>';

  // ─── Inject ───────────────────────────────────────────────────────
  function init() {
    var style = document.createElement('style');
    style.id = 'a11y-widget-styles';
    style.textContent = css;
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.id = 'a11y-widget-root';
    wrap.innerHTML = html;
    // IMPORTANT: append to documentElement (html), not body — body often has
    // transform: translateZ(0) (mobile horizontal-scroll defense) which
    // breaks position:fixed and would make the FAB scroll with the page.
    document.documentElement.appendChild(wrap);

    var fab = wrap.querySelector('#a11yFab');
    var panel = wrap.querySelector('#a11yPanel');
    var closeBtn = wrap.querySelector('#a11yClose');

    // ─── State ──────────────────────────────────────────────────────
    var STORAGE_KEY = 'a11y_settings_v1';
    var state = { textSize: 0, toggles: {} };
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (saved && typeof saved === 'object') {
        state.textSize = saved.textSize || 0;
        state.toggles = saved.toggles || {};
      }
    } catch (e) {}

    function save() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    }

    function applyTextSize() {
      document.body.classList.remove('a11y-text-large', 'a11y-text-larger', 'a11y-text-largest');
      if (state.textSize === 1) document.body.classList.add('a11y-text-large');
      else if (state.textSize === 2) document.body.classList.add('a11y-text-larger');
      else if (state.textSize >= 3) document.body.classList.add('a11y-text-largest');
    }

    function applyToggle(cls, on) {
      if (on) document.body.classList.add(cls);
      else document.body.classList.remove(cls);
      var btn = wrap.querySelector('[data-toggle="' + cls + '"]');
      if (btn) btn.classList.toggle('is-active', on);
    }

    function applyAll() {
      applyTextSize();
      Object.keys(state.toggles).forEach(function (cls) {
        applyToggle(cls, !!state.toggles[cls]);
      });
    }

    // ─── Wire ──────────────────────────────────────────────────────
    fab.addEventListener('click', function () { panel.classList.toggle('is-open'); });
    closeBtn.addEventListener('click', function () { panel.classList.remove('is-open'); });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) panel.classList.remove('is-open');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') panel.classList.remove('is-open');
    });

    wrap.querySelector('[data-action="text-larger"]').addEventListener('click', function () {
      if (state.textSize < 3) { state.textSize++; applyTextSize(); save(); }
    });
    wrap.querySelector('[data-action="text-smaller"]').addEventListener('click', function () {
      if (state.textSize > 0) { state.textSize--; applyTextSize(); save(); }
    });

    Array.prototype.forEach.call(wrap.querySelectorAll('[data-toggle]'), function (btn) {
      btn.addEventListener('click', function () {
        var cls = btn.getAttribute('data-toggle');
        state.toggles[cls] = !state.toggles[cls];
        applyToggle(cls, state.toggles[cls]);
        save();
      });
    });

    wrap.querySelector('#a11yReset').addEventListener('click', function () {
      state = { textSize: 0, toggles: {} };
      document.body.classList.remove('a11y-text-large', 'a11y-text-larger', 'a11y-text-largest');
      Array.prototype.forEach.call(wrap.querySelectorAll('[data-toggle]'), function (btn) {
        document.body.classList.remove(btn.getAttribute('data-toggle'));
        btn.classList.remove('is-active');
      });
      save();
    });

    applyAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
