/* Cookie consent banner — self-contained (CSS + DOM + handler).
 * Site: etorim.com · Privacy: /privacy-policy/
 * localStorage key: cookies_accepted_v1
 */
(function () {
  if (typeof window === 'undefined') return;
  try { if (localStorage.getItem('cookies_accepted_v1') === '1') return; } catch (e) {}
  if (!document.body) return;

  var PRIVACY_URL = '/privacy/';

  var css = '' +
    '.cc-banner{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;' +
    'background:#0A0A14;color:#F7F8FB;padding:12px 16px;border-radius:10px;' +
    'box-shadow:0 10px 30px -6px rgba(0,0,0,0.35);display:flex;align-items:center;' +
    'gap:14px;flex-wrap:wrap;font-family:Heebo,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;' +
    'font-size:13px;line-height:1.5;direction:rtl;max-width:920px;margin:0 auto;' +
    'animation:ccUp .35s cubic-bezier(.2,.8,.2,1) both}' +
    '@keyframes ccUp{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}' +
    '.cc-banner .cc-text{flex:1 1 260px;color:rgba(247,248,251,0.88);min-width:0}' +
    '.cc-banner .cc-text a{color:#FFF;text-decoration:underline;text-underline-offset:2px;' +
    'text-decoration-color:rgba(255,255,255,0.5);font-weight:600;transition:text-decoration-color .15s}' +
    '.cc-banner .cc-text a:hover{text-decoration-color:#FFF}' +
    '.cc-banner .cc-accept{flex-shrink:0;padding:10px 22px;background:#FFF;color:#0A0A14;' +
    'border:0;border-radius:8px;font-family:inherit;font-weight:800;font-size:13.5px;' +
    'cursor:pointer;transition:transform .12s ease,box-shadow .2s ease;white-space:nowrap}' +
    '.cc-banner .cc-accept:hover{transform:translateY(-1px);box-shadow:0 6px 14px -3px rgba(0,0,0,0.25)}' +
    '.cc-banner .cc-accept:active{transform:translateY(0)}' +
    '@media(max-width:560px){.cc-banner{padding:12px 14px;font-size:12px;gap:10px;left:8px;right:8px;bottom:8px}' +
    '.cc-banner .cc-accept{width:100%;padding:10px}}';

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
  document.body.appendChild(b);

  b.querySelector('.cc-accept').addEventListener('click', function () {
    try { localStorage.setItem('cookies_accepted_v1', '1'); } catch (e) {}
    b.style.transition = 'transform .3s, opacity .3s';
    b.style.transform = 'translateY(14px)';
    b.style.opacity = '0';
    setTimeout(function () { b.remove(); style.remove(); }, 320);
  });
})();
