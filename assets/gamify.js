/* ============================================================================
   GAMIFY LAYER — purely decorative, additive, error-tolerant.
   ----------------------------------------------------------------------------
   Items 1-9 from the gamification spec (2026-06-06):
     1. Progress milestone messages
     2. Living "your offer" card
     3. "Data saved" between-step toast
     4. Name personalization in the offer card
     5. Streak celebrations every N steps
     6. Cross-sell reframe ("פתחת זכאות" not "שירות נוסף")
     7. Value-in-shekels meter on cross-sells
     8. Two-calls reframe in insurance pitch
     9. Personal eligibility preview on extra-check OTP step
   ----------------------------------------------------------------------------
   Safety contract:
     - This file NEVER touches existing classes/IDs/handlers.
     - All new DOM nodes use `gamify-*` prefix.
     - All work is wrapped in try/catch — any failure silently no-ops.
     - If this script fails to load entirely, the quiz works exactly as before.
   ============================================================================ */
(function () {
  'use strict';
  if (window.__gamifyInited) return;
  window.__gamifyInited = true;

  // ── Tiny utilities ──────────────────────────────────────────────────────
  function $(sel, root) { try { return (root || document).querySelector(sel); } catch (e) { return null; } }
  function $$(sel, root) { try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; } }
  function safe(fn, label) { try { fn(); } catch (e) { try { console.warn('[gamify] ' + (label || 'fn') + ' failed (non-fatal):', e && e.message); } catch (_) {} } }
  function ready(fn) {
    if (document.readyState !== 'loading') return fn();
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
  function urlParam(name) {
    try {
      var r = new URLSearchParams(window.location.search).get(name);
      return r ? r.trim() : '';
    } catch (e) { return ''; }
  }
  function pickName() {
    var n = urlParam('name');
    if (n) return n;
    try {
      if (window.storedData && window.storedData.name) return String(window.storedData.name);
    } catch (e) {}
    try {
      var ls = localStorage.getItem('ymcs_user_v1');
      if (ls) { var o = JSON.parse(ls); if (o && o.name) return String(o.name); }
    } catch (e) {}
    return '';
  }
  function firstName(full) {
    if (!full) return '';
    var t = String(full).trim().split(/\s+/)[0];
    return (t && t.length > 1 && t.length < 25) ? t : '';
  }

  // ── Toast queue ─────────────────────────────────────────────────────────
  var __toastHost = null;
  function ensureToastHost() {
    if (__toastHost && document.body.contains(__toastHost)) return __toastHost;
    __toastHost = document.createElement('div');
    __toastHost.className = 'gamify-toast-host';
    __toastHost.id = 'gamifyToastHost';
    document.body.appendChild(__toastHost);
    return __toastHost;
  }
  function toast(text, opts) {
    safe(function () {
      var host = ensureToastHost();
      var el = document.createElement('div');
      el.className = 'gamify-toast' + (opts && opts.kind ? ' gamify-toast--' + opts.kind : '');
      el.textContent = text;
      host.appendChild(el);
      // animate
      requestAnimationFrame(function () { el.classList.add('gamify-toast-show'); });
      var ttl = (opts && opts.ttl) || 1700;
      setTimeout(function () {
        el.classList.remove('gamify-toast-show');
        setTimeout(function () { try { el.remove(); } catch (e) {} }, 260);
      }, ttl);
    }, 'toast');
  }

  // ── Step counter & milestone tracker ────────────────────────────────────
  var __stepHistory = [];  // ordered list of step IDs the user transitioned to
  var __progressMsgEl = null;
  var __PROGRESS_MILESTONES = [
    { from: 25, to: 50,  text: '🎯 הפרופיל שלך מתחיל לקבל צורה — תמשיך!' },
    { from: 50, to: 75,  text: '💪 כבר חצי הדרך — נשאר פחות מדקה' },
    { from: 75, to: 90,  text: '🎉 כמעט שם! ההצעה שלך כמעט מוכנה' },
    { from: 90, to: 100, text: '✨ עוד שאלה אחת ויש לך הצעה!' },
  ];
  function getProgressPct() {
    try {
      var all = $$('.form-step').filter(function (el) {
        return !el.classList.contains('conditional-step') &&
               !el.classList.contains('post-submit-step') &&
               !el.classList.contains('no-back');
      });
      if (!all.length) return 0;
      var active = $('.form-step.active-step');
      if (!active) return 0;
      var idx = all.indexOf(active);
      if (idx < 0) return 0;
      return Math.round(((idx + 1) / all.length) * 100);
    } catch (e) { return 0; }
  }
  function updateProgressMsg() {
    safe(function () {
      if (!__progressMsgEl) return;
      var pct = getProgressPct();
      var match = __PROGRESS_MILESTONES.filter(function (m) { return pct >= m.from && pct < m.to; })[0];
      if (match) {
        if (__progressMsgEl.textContent !== match.text) __progressMsgEl.textContent = match.text;
        __progressMsgEl.classList.add('gamify-show');
      } else {
        __progressMsgEl.classList.remove('gamify-show');
      }
    }, 'updateProgressMsg');
  }

  // ── F1: Progress milestone messages ─────────────────────────────────────
  function setupProgressMessages() {
    safe(function () {
      var bar = $('.progress-bar') || $('#progress-bar');
      if (!bar) return;
      if ($('#gamifyProgressMsg')) return;
      var el = document.createElement('div');
      el.id = 'gamifyProgressMsg';
      el.className = 'gamify-progress-msg';
      bar.parentNode.insertBefore(el, bar);
      __progressMsgEl = el;
      updateProgressMsg();
    }, 'setupProgressMessages');
  }

  // ── F2 + F4: Living "your offer" card with name personalization ─────────
  // Maps storedData fields → human-readable rows.
  var __OFFER_ROWS = [
    { key: 'loanAmount',           pending: 'סכום הלוואה',          format: function (v) { return 'סכום: ₪' + Number(String(v).replace(/\D/g,'')).toLocaleString(); } },
    { key: 'fld_179819',           pending: 'גיל',                  format: function (v) { return 'גיל: ' + v; }, alt: 'age' },
    { key: 'fld_179821',           pending: 'עיר מגורים',           format: function (v) { return 'עיר: ' + v; } },
    { key: 'fld_183161',           pending: 'סטטוס תעסוקתי',         format: function (v) { return v; } },
    { key: 'monthlyIncome',        pending: 'הכנסה',                format: function (v) { return 'הכנסה: ₪' + Number(String(v).replace(/\D/g,'')).toLocaleString(); } },
    { key: 'fld_179820',           pending: 'אימייל',               format: function (v) { return 'אימייל אומת'; } },
  ];
  var __offerCardEl = null;
  function buildOfferCard() {
    safe(function () {
      var card = $('.page-card') || $('.glass-card') || $('#mainCard');
      if (!card) return;
      if ($('#gamifyOfferCard')) { __offerCardEl = $('#gamifyOfferCard'); return; }
      var name = firstName(pickName());
      var el = document.createElement('div');
      el.id = 'gamifyOfferCard';
      el.className = 'gamify-offer-card';
      el.innerHTML =
        '<div class="gamify-offer-title">🎯 ' + (name ? (name + ', ההצעה שלך נבנית:') : 'ההצעה שלך נבנית:') + '</div>' +
        '<div class="gamify-offer-rows" id="gamifyOfferRows"></div>';
      // Insert at start of page-card so it sits ABOVE the topbar/progress
      var inner = card.querySelector('.page-card-inner') || card;
      inner.insertBefore(el, inner.firstChild);
      __offerCardEl = el;
    }, 'buildOfferCard');
  }
  function refreshOfferCard() {
    safe(function () {
      if (!__offerCardEl) return;
      var sd = (window.storedData || {});
      var rowsHost = $('#gamifyOfferRows', __offerCardEl);
      if (!rowsHost) return;
      var anyData = false;
      var html = __OFFER_ROWS.map(function (r) {
        var v = sd[r.key];
        if (!v && r.alt) v = sd[r.alt];
        if (v && String(v).trim()) {
          anyData = true;
          try {
            return '<div class="gamify-offer-row">' + escHtml(r.format(v)) + '</div>';
          } catch (e) { return ''; }
        }
        return '<div class="gamify-offer-row gamify-offer-pending">' + escHtml(r.pending) + '</div>';
      }).join('');
      rowsHost.innerHTML = html;
      // Hide card entirely until at least one row is real, so it doesn't look empty
      __offerCardEl.style.display = anyData ? '' : 'none';
    }, 'refreshOfferCard');
  }
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  // ── F3 + F5: Save toast + streak celebrations ───────────────────────────
  var __stepChangeCounter = 0;
  function onStepChanged(activeStepId) {
    __stepChangeCounter++;
    safe(updateProgressMsg, 'progress');
    safe(refreshOfferCard, 'offer');

    // F3 — "saved" toast (skip the first step, no point)
    if (__stepChangeCounter > 1) {
      var totalReal = $$('.form-step').filter(function (el) {
        return !el.classList.contains('conditional-step') &&
               !el.classList.contains('post-submit-step') &&
               !el.classList.contains('no-back');
      }).length || 0;
      if (totalReal && __stepChangeCounter <= totalReal) {
        toast('💾 הפרטים נשמרו (' + __stepChangeCounter + '/' + totalReal + ')', { kind: 'save', ttl: 1400 });
      }
    }

    // F5 — streak celebration every 3 steps (cap at 12 so it doesn't spam)
    if (__stepChangeCounter > 0 && __stepChangeCounter % 3 === 0 && __stepChangeCounter <= 12) {
      setTimeout(function () {
        toast('🔥 ' + __stepChangeCounter + ' ברצף!', { kind: 'streak', ttl: 1500 });
      }, 700);  // staggered so it doesn't collide with the save toast
    }

    // F9 — eligibility preview when entering extra-check OTP
    if (activeStepId === 'otp_verify_extra') safe(injectEligibilityPreview, 'preview');
  }

  // ── MutationObserver for active-step changes ────────────────────────────
  function watchActiveStep() {
    safe(function () {
      var lastId = null;
      var obs = new MutationObserver(function () {
        try {
          var cur = $('.form-step.active-step');
          var id  = cur && cur.id;
          if (id && id !== lastId) {
            lastId = id;
            onStepChanged(id);
          }
        } catch (e) {}
      });
      obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
      // Fire once for initial state
      var cur = $('.form-step.active-step');
      if (cur && cur.id) { lastId = cur.id; onStepChanged(cur.id); }
    }, 'watchActiveStep');
  }

  // ── Periodic poll for offer-card data (covers updates not tied to step change) ──
  function pollOfferCard() {
    safe(refreshOfferCard, 'pollOfferCard');
  }

  // ── F6: Cross-sell reframe — "פתחת זכאות" instead of "שירות נוסף" ───────
  function setupCrossSellReframes() {
    safe(function () {
      // Insurance pitch
      var insBadge = $('#insurancePitch .pitch-badge');
      if (insBadge && !insBadge.dataset.gamifyReframed) {
        insBadge.textContent = '🎁 פתחת זכאות נוספת בחינם!';
        insBadge.dataset.gamifyReframed = '1';
      }
      // Tax-refund pitch
      var taxBadge = $('#fld_283971 .pitch-badge');
      if (taxBadge && !taxBadge.dataset.gamifyReframed) {
        taxBadge.textContent = '💰 פתחת זכאות להחזר מס';
        taxBadge.dataset.gamifyReframed = '1';
      }
    }, 'setupCrossSellReframes');
  }

  // ── F7: Value meters on each cross-sell pitch ───────────────────────────
  var __VALUE_METERS = [
    {
      target: '#insurancePitch',
      anchor: '.pitch-badge',
      placement: 'after',
      html: '💰 ערך משוער: <strong>חיסכון של עד ₪3,200/שנה</strong><span class="gamify-value-sep">·</span>⏱️ <strong>30 שניות</strong>',
    },
    {
      target: '#extra_check_pitch .success-body',
      anchor: '*',
      placement: 'before',
      html: '🎁 <strong>בדיקה חינמית</strong> בעלות אפס לך<span class="gamify-value-sep">·</span>⏱️ <strong>30 שניות</strong>',
    },
    {
      target: '#fld_283971',
      anchor: '.pitch-badge',
      placement: 'after',
      html: '💰 ערך משוער: <strong>החזר ממוצע ₪4,800</strong><span class="gamify-value-sep">·</span>⏱️ <strong>45 שניות</strong>',
    },
  ];
  function setupValueMeters() {
    safe(function () {
      __VALUE_METERS.forEach(function (cfg) {
        var hostEl = $(cfg.target);
        if (!hostEl) return;
        if (hostEl.querySelector(':scope > .gamify-value-meter, .gamify-value-meter')) return;  // already inserted
        var el = document.createElement('div');
        el.className = 'gamify-value-meter';
        el.innerHTML = cfg.html;
        var anchor = cfg.anchor === '*' ? hostEl : hostEl.querySelector(cfg.anchor);
        if (cfg.placement === 'after' && anchor && anchor.parentNode) {
          anchor.parentNode.insertBefore(el, anchor.nextSibling);
        } else if (cfg.placement === 'before' && anchor) {
          var p = (cfg.anchor === '*') ? anchor : anchor.parentNode;
          p.insertBefore(el, (cfg.anchor === '*') ? p.firstChild : anchor);
        }
      });
    }, 'setupValueMeters');
  }

  // ── F8: Two-calls reframe — replace "2 separate calls" wording inside insurance pitch ──
  function setupTwoCallsReframe() {
    safe(function () {
      // Find the yellow callout in #insurancePitch (the one starting with "📞 חשוב להבין")
      var pitch = $('#insurancePitch');
      if (!pitch) return;
      var divs = pitch.querySelectorAll('div');
      for (var i = 0; i < divs.length; i++) {
        var d = divs[i];
        if (d.dataset.gamifyTwoCalls) return;  // already done somewhere
        if (d.textContent && d.textContent.indexOf('2 שיחות נפרדות') !== -1 &&
            (d.style.background || '').indexOf('255,193') !== -1) {
          // Found the yellow callout — replace its inner with the gentler 2-calls explanation
          d.innerHTML =
            '<div style="font-weight:700; margin-bottom:8px; font-size:15px;">📞 2 שיחות שונות, אבל מאותו צוות:</div>' +
            '<div style="margin:6px 0;"><strong>① הראשונה — מומחה אשראי</strong> שלנו <span style="opacity:.75;">(כבר אישרת לטיפול בהלוואה)</span></div>' +
            '<div style="margin:6px 0;"><strong>② השנייה — מומחה ביטוח</strong> מורשה <span style="opacity:.75;">(חדש — חינם, ללא עלות)</span></div>' +
            '<div style="margin-top:10px; font-size:13px; opacity:0.92;">✓ זמני שיחה מתואמים מראש — לא תפסיד את הזמן שלך<br>✓ ללא עלות וללא התחייבות לסגירת ביטוח חדש</div>';
          d.dataset.gamifyTwoCalls = '1';
          return;
        }
      }
    }, 'setupTwoCallsReframe');
  }

  // ── F9: Eligibility preview on extra-check OTP step ─────────────────────
  function injectEligibilityPreview() {
    safe(function () {
      var otpStep = $('#otp_verify_extra');
      if (!otpStep) return;
      if (otpStep.querySelector('.gamify-preview')) return;
      var choice = (window.storedData && window.storedData.extraCheckChoice) || '';
      var preview = document.createElement('div');
      preview.className = 'gamify-preview';
      if (choice === 'grant') {
        preview.innerHTML =
          '<div class="gamify-preview-eyebrow">זכאות ראשונית נראית מבטיחה ✨</div>' +
          '<div class="gamify-preview-amount">₪2,800 – ₪8,600 בשנה</div>' +
          '<div class="gamify-preview-hint">הערכה ראשונית — הסכום הסופי ייקבע ע״י נציג</div>';
      } else if (choice === 'locate') {
        preview.innerHTML =
          '<div class="gamify-preview-eyebrow">זכאות ראשונית נראית מבטיחה ✨</div>' +
          '<div class="gamify-preview-amount">פוטנציאל לאיתור של עד ₪80,000</div>' +
          '<div class="gamify-preview-hint">החיסכון המוערך לאיתור — נציג יחזור עם בדיקה מלאה</div>';
      } else {
        return;
      }
      // Insert as the first child of the success-card so it appears right under the title
      var card = otpStep.querySelector('.success-card');
      if (card) {
        // After the q-title / success-title for visual flow
        var titleEl = card.querySelector('.success-title') || card.querySelector('h2');
        if (titleEl && titleEl.parentNode) {
          titleEl.parentNode.insertBefore(preview, titleEl.nextSibling);
        } else {
          card.insertBefore(preview, card.firstChild);
        }
      }
    }, 'injectEligibilityPreview');
  }

  // ── Init ────────────────────────────────────────────────────────────────
  ready(function () {
    safe(buildOfferCard,             'F2 init buildOfferCard');
    safe(refreshOfferCard,           'F2 init refreshOfferCard');
    safe(setupProgressMessages,      'F1 init setupProgressMessages');
    safe(setupCrossSellReframes,     'F6 init setupCrossSellReframes');
    safe(setupValueMeters,           'F7 init setupValueMeters');
    safe(setupTwoCallsReframe,       'F8 init setupTwoCallsReframe');
    safe(watchActiveStep,            'F3/F5/F9 init watchActiveStep');
    // Poll offer card every 1.2s for storedData changes that don't trigger step change
    setInterval(pollOfferCard, 1200);
  });
})();
