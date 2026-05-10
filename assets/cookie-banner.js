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
    b.style.transition = 'transform .35s, opacity .35s';
    b.style.transform = 'translateY(24px) rotate(-2deg)';
    b.style.opacity = '0';
    setTimeout(function () { b.remove(); style.remove(); }, 360);
  });
})();
