/* ==========================================================================
   כפתור צף לפתיחת שיחה בוואטסאפ עם הבוט (מדיה נט, 073-778-0749).
   משותף ל-21 אתרי ההלוואות. לעדכן במקור אחד ולהעתיק לכולם.

   מיקום — נבחר אחרי מיפוי כל האלמנטים הצפים בדף:
     · פינה שמאלית-תחתונה  → כפתור הנגישות (a11y-fab, bottom:18 left:18)
     · bottom:90 right:16  → טוסט הוכחה-חברתית (.ymsp), במובייל ברוחב מלא
     · bottom:24 מרכז      → טוסט ההסכמה (pointer-events:none)
   לכן: ימין-תחתון, באותה גיאומטריה של כפתור הנגישות כדי שייראו זוג סימטרי,
   ומתחת לטוסט ההוכחה החברתית בלי לגעת בו.

   ⚠️ מצורף ל-<html> ולא ל-<body>. ל-body יש transform:translateZ(0) מהגנת
   הגלילה האופקית, ו-transform יוצר containing block חדש — position:fixed
   בתוכו נצמד למסמך ומתחיל לגלול עם הדף. אותה מלכודת בדיוק ש-social-proof.js
   מתעד. אל תעביר ל-body.

   ⚠️ z-index נמוך מכפתור הנגישות (2147483647) ומהטוסט (2147483600) בכוונה:
   פאנל הנגישות נפתח ברוחב שעלול להגיע לצד הימני במסך צר, והוא חייב להישאר
   מעל. נגישות היא דרישה חוקית — היא מנצחת.
   ========================================================================== */
(function () {
  "use strict";

  var PHONE = "972737780749";
  // ⚠️ הדומיין נכתב לתוך ההודעה בכוונה. wa.me לא מעביר referrer ולא שום
  // מטא-דאטה, ולכן זו הדרך היחידה שהבוט ידע מאיזה אתר הגיע הליד ויכתוב
  // אותו לשדה "מוצא". המשתמש רואה את זה ויכול למחוק — ואז פשוט אין מוצא.
  var PREFILL = "היי, אשמח לבדוק אפשרויות מימון · " +
                String(location.hostname || "").replace(/^www\./, "");
  var DELAY_MS = 1200;          // לא מופיע בזמן טעינה — נותן לדף להתייצב
  var ID = "ymedia-wa-fab";

  if (document.getElementById(ID)) return;                 // כבר נשתל
  if (navigator.userAgent.indexOf("Googlebot") !== -1) return;

  /* ------------------------------------------------------------------
     מי שכבר מסר פרטים הוא ליד — הכפתור נעלם. מטרתו לשפר המרה בתחילת
     המשפך, לא למשוך החוצה מישהו שכבר בפנים.

     שלוש שכבות, כי 21 האתרים לא בנויים אותו דבר:
       1. סימון ה-localStorage שנכתב בשליחה מוצלחת (19 מהם)
       2. אירוע submit על כל טופס בעמוד (מכסה את calmash ו-car-loans,
          שאין להם את הסימון)
       3. פרמטר ליד ב-URL, למקרה של חזרה לעמוד אחרי שליחה
     ------------------------------------------------------------------ */
  var FRESH_DAYS = 30;

  var SESSION_KEY = "ymwa_lead_v1";

  /**
   * ⚠️ נבדק רק מה שיש לו חותמת זמן. `ymcs_ylead_id_v1` נכתב ע"י lead-backup
   * בכל שמירה מתקדמת — כבר כשמקלידים שם ויוצאים מהשדה, גם בלי לשלוח —
   * ואין לו תאריך. התייחסות לעצם קיומו כ"ליד" הסתירה את הכפתור לתמיד ממי
   * שאי פעם נגע בטופס. אותו דבר ל-ymcs_user_v1 בלי ts.
   *
   * נכשל לכיוון הצגה: ספק אם הוא ליד → מראים. השכבה של אירוע ה-submit
   * ממילא תופסת את מי שמוסר פרטים עכשיו.
   */
  function leadCaptured() {
    try { if (sessionStorage.getItem(SESSION_KEY)) return true; } catch (e) {}
    try {
      var raw = localStorage.getItem("ymcs_user_v1");
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.ts && (Date.now() - o.ts) < FRESH_DAYS * 864e5) return true;
      }
    } catch (e) { /* מצב פרטי / אחסון חסום — לא מסתירים */ }
    try {
      var q = new URLSearchParams(location.search);
      if (q.get("response") || q.get("lead_id")) return true;
    } catch (e) {}
    return false;
  }

  if (leadCaptured()) return;

  var CSS =
      '#' + ID + '{'
    + 'position:fixed;bottom:18px;right:18px;width:46px;height:46px;'
    + 'border-radius:50%;background:#25D366;border:2px solid #fff;'
    + 'box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer;'
    + 'z-index:2147483500;display:flex;align-items:center;justify-content:center;'
    + 'padding:0;text-decoration:none;opacity:0;transform:scale(.8);'
    + 'transition:opacity .3s ease,transform .3s cubic-bezier(.34,1.56,.64,1),bottom .25s ease,box-shadow .2s;'
    + '}'
    + '#' + ID + '.is-in{opacity:1;transform:scale(1)}'
    + '#' + ID + ':hover{box-shadow:0 6px 20px rgba(37,211,102,.5)}'
    + '#' + ID + ':focus-visible{outline:3px solid #128C7E;outline-offset:3px}'
    + '#' + ID + ' svg{width:26px;height:26px;display:block}'
    /* סרגל העוגיות מכסה את תחתית המסך — עולים יחד עם כפתור הנגישות */
    + 'html.cc-active #' + ID + '{bottom:70px}'
    /* תווית שנפתחת בריחוף. ממוקמת שמאלה מהכפתור כדי לא לחרוג מהמסך */
    + '#' + ID + ' .ymwa-tip{'
    + 'position:absolute;right:58px;top:50%;transform:translateY(-50%) translateX(6px);'
    + 'background:#111827;color:#fff;font:600 13px/1 Heebo,Assistant,Arial,sans-serif;'
    + 'padding:9px 13px;border-radius:9px;white-space:nowrap;opacity:0;pointer-events:none;'
    + 'transition:opacity .2s ease,transform .2s ease;direction:rtl}'
    + '#' + ID + ':hover .ymwa-tip,#' + ID + ':focus-visible .ymwa-tip{opacity:1;transform:translateY(-50%) translateX(0)}'
    /* טוסט ההוכחה החברתית יושב ב-bottom:90 וגובר עלינו ב-z-index. כשסרגל
       העוגיות פעיל הכפתורים עולים ל-70..116 והטוסט חותך את ראש הכפתור —
       נמדד בדפדפן, לא שוער. מרימים אותו מעל שניהם. הסלקטור ספציפי יותר
       משל social-proof.js ולכן גובר בלי !important. */
    + 'html.cc-active .ymsp{bottom:126px}'
    + '@media (max-width:480px){'
    + '#' + ID + '{width:42px;height:42px;bottom:14px;right:14px}'
    + '#' + ID + ' svg{width:23px;height:23px}'
    + '#' + ID + ' .ymwa-tip{display:none}'          /* אין ריחוף במגע */
    + 'html.cc-active #' + ID + '{bottom:80px}'
    + 'html.cc-active .ymsp{bottom:132px}'
    + '}'
    + '@media (prefers-reduced-motion:reduce){#' + ID + '{transition:opacity .01s}}'
    + '@media print{#' + ID + '{display:none}}';

  var style = document.createElement("style");
  style.appendChild(document.createTextNode(CSS));
  document.head.appendChild(style);

  var a = document.createElement("a");
  a.id = ID;
  a.href = "https://wa.me/" + PHONE + "?text=" + encodeURIComponent(PREFILL);
  a.target = "_blank";
  a.rel = "noopener noreferrer nofollow";
  a.setAttribute("aria-label", "פתיחת שיחה בוואטסאפ");
  a.innerHTML =
      '<span class="ymwa-tip">דברו איתנו בוואטסאפ</span>'
    + '<svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true" focusable="false">'
    + '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2M12.05 3.67c2.2 0 4.26.86 5.82 2.42a8.2 8.2 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.69-8.24 8.25-8.24M8.53 7.33c-.16 0-.43.06-.66.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.39 1 2.56.14.17 1.72 2.75 4.23 3.74 2.09.82 2.51.66 2.97.62.46-.04 1.48-.6 1.69-1.19.21-.58.21-1.09.15-1.19-.07-.1-.23-.16-.48-.27-.25-.14-1.47-.74-1.7-.82-.23-.08-.39-.12-.56.12-.16.25-.64.81-.78.97-.15.17-.29.19-.53.07-.26-.13-1.06-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.12-.24-.01-.39.11-.5.11-.11.27-.29.37-.44.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.11-.56-1.35-.77-1.84-.2-.48-.4-.42-.56-.43-.14 0-.3-.01-.47-.01"/>'
    + '</svg>';

  a.addEventListener("click", function () {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "whatsapp_click", wa_source: "loan_fab" });
    } catch (e) { /* אנליטיקס לא חוסם פתיחת שיחה */ }
  });

  function hide() {
    // נשמר לסשן כדי שחזרה לעמוד לא תחזיר את הכפתור למי שהרגע מסר פרטים —
    // גם באתרים שלא כותבים סימון משלהם.
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (e) {}
    if (a && a.parentNode) a.parentNode.removeChild(a);
    document.removeEventListener("submit", hide, true);
    if (watch) { clearInterval(watch); watch = null; }
  }

  var watch = null;

  function mount() {
    // ל-<html>, לא ל-<body> — ראה ההערה בראש הקובץ.
    document.documentElement.appendChild(a);
    setTimeout(function () { a.classList.add("is-in"); }, DELAY_MS);

    // שכבה 2 — כל שליחת טופס בעמוד. capture כדי לתפוס גם כשהמטפל
    // של האתר עוצר את האירוע.
    document.addEventListener("submit", hide, true);

    // שכבה 1 בזמן אמת — טפסי AJAX כותבים את הסימון בלי אירוע submit.
    // נעצר אחרי 10 דקות; מי שעדיין בעמוד אז לא ממלא טופס.
    var stopAt = Date.now() + 6e5;
    watch = setInterval(function () {
      if (leadCaptured()) return hide();
      if (Date.now() > stopAt) { clearInterval(watch); watch = null; }
    }, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
