/* Cookie consent banner — site: mimonchik.com (sticker playful)
 * Privacy: /privacy-policy/ · localStorage: cookies_accepted_v1
 */
(function () {
  if (typeof window === 'undefined') return;
  try { if (localStorage.getItem('cookies_accepted_v1') === '1') return; } catch (e) {}
  if (!document.body) return;

  var PRIVACY_URL = '/privacy-policy/';

  var css = '' +
    '.cc-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;' +
    'background:#FFFCF5;color:#1A3A35;' +
    'padding:14px 20px;border-radius:20px;border:3px solid #1A3A35;' +
    'box-shadow:5px 5px 0 #1A3A35,5px 5px 0 4px #FFD93D;' +
    'display:flex;align-items:center;gap:14px;flex-wrap:wrap;' +
    'font-family:Rubik,Heebo,-apple-system,system-ui,sans-serif;' +
    'font-size:14px;line-height:1.55;direction:rtl;max-width:920px;margin:0 auto;' +
    'animation:ccUp .45s cubic-bezier(.34,1.56,.64,1) both;font-weight:500;' +
    'transform:rotate(-0.4deg)}' +
    '@keyframes ccUp{from{transform:translateY(24px) rotate(-2deg);opacity:0}to{transform:translateY(0) rotate(-0.4deg);opacity:1}}' +
    '.cc-banner .cc-text{flex:1 1 280px;color:#4F635F;min-width:0}' +
    '.cc-banner .cc-text a{color:#1A5E55;text-decoration:underline;text-underline-offset:3px;' +
    'text-decoration-thickness:2px;font-weight:700;transition:color .15s}' +
    '.cc-banner .cc-text a:hover{color:#2D8B7E}' +
    '.cc-banner .cc-accept{flex-shrink:0;padding:11px 24px;background:#FFD93D;color:#1A3A35;' +
    'border:2.5px solid #1A3A35;border-radius:14px;font-family:Rubik,inherit;font-weight:800;font-size:14px;' +
    'cursor:pointer;transition:transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .15s ease;white-space:nowrap;' +
    'box-shadow:3px 3px 0 #1A3A35;letter-spacing:-0.005em}' +
    '.cc-banner .cc-accept:hover{transform:translate(-2px,-2px) rotate(-0.5deg);box-shadow:5px 5px 0 #1A3A35;background:#F5C518}' +
    '.cc-banner .cc-accept:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #1A3A35}' +
    '@media(max-width:560px){.cc-banner{padding:13px 16px;font-size:13px;gap:10px;left:10px;right:10px;bottom:10px;border-radius:16px;box-shadow:3px 3px 0 #1A3A35,3px 3px 0 4px #FFD93D;transform:rotate(0deg)}' +
    '.cc-banner .cc-accept{width:100%;padding:11px}}';

  css += '.cc-banner{left:0!important;right:0!important;bottom:0!important;top:auto!important;margin:0!important;max-width:none!important;border-radius:0!important;border-width:0!important;padding:8px 14px!important;gap:10px!important;font-size:12.5px!important;line-height:1.4!important;flex-wrap:nowrap!important;align-items:center!important;box-shadow:0 -2px 12px rgba(0,0,0,.18)!important}.cc-banner::before{display:none!important}.cc-banner::after{display:none!important}.cc-banner .cc-text{padding-top:0!important;font-size:12px!important;line-height:1.4!important;flex:1 1 auto!important;min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;display:-webkit-box!important;-webkit-line-clamp:2!important;-webkit-box-orient:vertical!important}.cc-banner .cc-accept{padding:7px 18px!important;font-size:13px!important;border-radius:6px!important;clip-path:none!important;font-style:normal!important;letter-spacing:0!important;width:auto!important;min-width:0!important;white-space:nowrap!important;transform:none!important}@media(max-width:640px){.cc-banner{padding:7px 10px!important;font-size:11.5px!important;gap:8px!important;flex-wrap:wrap!important}.cc-banner .cc-text{flex:1 1 100%!important;font-size:11.5px!important;-webkit-line-clamp:3!important}.cc-banner .cc-accept{width:auto!important;padding:7px 16px!important;font-size:12.5px!important;flex:0 0 auto!important;align-self:flex-end!important}}'; /* YMEDIA-SLIM-OVERRIDE v1 */


  var style = document.createElement('style');
  style.setAttribute('data-cc', '');
  style.textContent = css;
  document.head.appendChild(style);

  var b = document.createElement('div');
  b.className = 'cc-banner';
  b.setAttribute('role', 'dialog');
  b.setAttribute('aria-label', 'הודעת עוגיות');
  b.innerHTML =
    '<div class="cc-text">אנו משתמשים בעוגיות לשיפור חוויית הגלישה בהתאם לחוק הגנת הפרטיות בישראל. ' +
    'בלחיצה על "אני מאשר/ת" אתה מסכים לשימוש בעוגיות. ' +
    '<a href="' + PRIVACY_URL + '">מדיניות פרטיות &raquo;</a></div>' +
    '<button type="button" class="cc-accept">אני מאשר/ת</button>';
  document.documentElement.appendChild(b);

  // YMEDIA-SLIM-OVERRIDE v1 — reserve viewport bottom-padding for the banner
  var __ymPad = function(){ try { document.body.style.paddingBottom = (b.offsetHeight + 4) + 'px'; } catch(e){} };
  __ymPad();
  if (window.ResizeObserver) { try { new ResizeObserver(__ymPad).observe(b); } catch(e){} }
  window.addEventListener('resize', __ymPad);


  b.querySelector('.cc-accept').addEventListener('click', function () {
    try { document.body.style.paddingBottom = ''; } catch (e) {}
    try { localStorage.setItem('cookies_accepted_v1', '1'); } catch (e) {}
    b.style.transition = 'transform .35s, opacity .35s';
    b.style.transform = 'translateY(24px) rotate(-2deg)';
    b.style.opacity = '0';
    setTimeout(function () { b.remove(); style.remove(); }, 360);
  });
})();
