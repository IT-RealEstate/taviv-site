/* העוזר של טביב שמאות.
   Two questions (where things stand, what was already done) → a short preparation →
   a document built from the answers. The first part is open; the rest opens once
   the visitor leaves a name and a phone number. All wording comes from cases/cases.json. */
(function () {
  'use strict';

  var root = document.getElementById('asst');
  if (!root) { return; }

  var PATHS = window.TAVIV_PATHS || {};
  var CASES_URL = PATHS.cases || '/cases/cases.json';
  var DEMO = !!PATHS.demo;
  var cfg = window.INTAKE_CONFIG || {};
  var WA_NUMBER = cfg.whatsappNumber || '972552617625';
  var LEGAL_RELEASE = '2026-09-04.1';          // same notice the /check/ form shows
  var STORE_KEY = 'tv_asst';
  var icon = window.TAVIV_ICON || function () { return ''; };
  var logo = window.TAVIV_LOGO || function () { return ''; };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var timers = [];
  function clearTimers() { timers.forEach(function (t) { window.clearTimeout(t); }); timers = []; }

  var params = {};
  location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
    if (!kv) { return; }
    var i = kv.indexOf('=');
    var k = decodeURIComponent(i === -1 ? kv : kv.slice(0, i));
    params[k] = i === -1 ? '' : decodeURIComponent(kv.slice(i + 1));
  });

  var data = null;
  var startedAt = new Date().toISOString();
  var st = {
    caseId: params['case'] || '',
    stage: params.state || '',     // the general stage picked on the home page, if any
    stateId: '',                   // the answer that fits this kind of damage
    done: {},
    name: '', phone: '', email: '', unlocked: false, leadId: ''
  };

  function load() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
      if (saved && saved.caseId === st.caseId) {
        st.name = saved.name || ''; st.phone = saved.phone || ''; st.email = saved.email || '';
        st.leadId = saved.leadId || '';
      }
      // details already typed into the /check/ form in this visit fill in here too
      var draft = JSON.parse(sessionStorage.getItem('intake_draft_v2') || 'null');
      if (draft) {
        if (!st.name && draft.full_name) { st.name = draft.full_name; }
        if (!st.phone && draft.phone_raw) { st.phone = draft.phone_raw; }
        if (!st.email && draft.email) { st.email = draft.email; }
      }
    } catch (e) {}
  }
  function save() {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({
        caseId: st.caseId, name: st.name, phone: st.phone, email: st.email, leadId: st.leadId
      }));
    } catch (e) {}
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } }
    return null;
  }
  function theCase() { return byId(data.cases, st.caseId); }
  function theState() { var c = theCase(); return c ? byId(c.states, st.stateId) : null; }
  function famColor(c) { return (data.families[c.family] || {}).color || '#A7AFB5'; }

  // a ruling is shown only once it was checked against the full text; the demo shows drafts, marked
  function theRuling(c, s) {
    var id = (s && s.ruling) || c.doc.ruling;
    var r = id ? data.rulings[id] : null;
    if (!r) { return null; }
    if (!r.verified && !DEMO) { return null; }
    return r;
  }

  function top(step, onBack) {
    var dots = '';
    for (var i = 1; i <= 3; i++) { dots += '<i' + (i <= step ? ' class="on"' : '') + '></i>'; }
    return '<div class="asst__top">' +
      (onBack ? '<button type="button" class="asst__back" data-back>' + icon('arrow') + 'חזרה</button>' : '<span></span>') +
      '<div class="asst__dots" role="img" aria-label="שלב ' + step + ' מתוך 3">' + dots + '</div></div>';
  }
  function caseChip(c) {
    return '<div class="asst__case"><span class="asst__case-icon">' + icon(c.icon) + '</span><span>' + esc(c.label) + '</span></div>';
  }

  function show(html, color) {
    clearTimers();
    root.style.setProperty('--fam', color || '#1F8EB1');
    root.innerHTML = html;
    window.scrollTo(0, 0);
    var h = root.querySelector('.asst__h');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  function on(sel, type, fn) {
    Array.prototype.forEach.call(root.querySelectorAll(sel), function (el) { el.addEventListener(type, function (e) { fn(el, e); }); });
  }
  function goHome() {
    location.href = (PATHS.home || '/') + (st.stage ? '?state=' + encodeURIComponent(st.stage) : '') + '#tv-hero';
  }

  /* ---------- only when someone lands here without choosing in the building ---------- */
  function picker() {
    st.caseId = '';
    var tiles = data.cases.map(function (c) {
      return '<button type="button" class="choice" data-case="' + esc(c.id) + '" style="--fam:' + famColor(c) + '">' +
        '<span class="choice__icon">' + icon(c.icon) + '</span><span>' + esc(c.label) + '</span></button>';
    }).join('');
    show('<div class="asst__top"><span></span><span></span></div>' +
      '<div class="asst__brand">' + logo() + '<p class="asst__eyebrow">העוזר של טביב שמאות</p></div>' +
      '<h1 class="asst__h">היכן הופיע הנזק?</h1>' +
      '<div class="choices choices--grid">' + tiles + '</div>');
    on('[data-case]', 'click', function (b) {
      st.caseId = b.getAttribute('data-case'); st.stateId = ''; st.done = {}; st.unlocked = false;
      start();
    });
  }

  // the home page asks a general "where do things stand"; use it when it points at one answer here
  function start() {
    var c = theCase();
    if (!c) { return picker(); }
    load();
    if (st.stage && !st.stateId) {
      var fit = c.states.filter(function (s) { return s.stage === st.stage; });
      if (fit.length === 1) { st.stateId = fit[0].id; return askedScreen(true); }
    }
    stateScreen();
  }

  /* ---------- question 1: where things stand, in the words of this kind of damage ---------- */
  function stateScreen() {
    var c = theCase();
    var opts = c.states.map(function (s) {
      return '<button type="button" class="choice" data-state="' + esc(s.id) + '">' +
        '<span class="choice__icon">' + icon(s.icon) + '</span><span>' + esc(s.label) + '</span></button>';
    }).join('');
    show(top(1, false) + caseChip(c) +
      '<h1 class="asst__h">מה המצב עכשיו?</h1>' +
      (c.safety ? '<p class="asst__safety" role="note">' + icon('alert') + '<span>' + esc(c.safety) + '</span></p>' : '') +
      '<div class="choices">' + opts + '</div>' +
      '<button type="button" class="asst__alt" data-pick>זה לא הנזק שלי</button>', famColor(c));
    on('[data-state]', 'click', function (b) { st.stateId = b.getAttribute('data-state'); askedScreen(false); });
    on('[data-pick]', 'click', goHome);
  }

  /* ---------- question 2: what was already done (a question, not a to-do list) ---------- */
  function askedScreen(skippedState) {
    var c = theCase(), s = theState();
    if (!s) { return stateScreen(); }
    var items = c.asked.map(function (a) {
      return '<li><button type="button" class="tick' + (a.risk ? ' tick--risk' : '') + '" data-ask="' + esc(a.id) + '" aria-pressed="' + (st.done[a.id] ? 'true' : 'false') + '">' +
        '<span class="tick__box">' + icon('tick') + '</span>' +
        '<span class="tick__text">' + esc(a.q) + '</span>' +
        '<span class="tick__icon">' + icon(a.icon) + '</span></button></li>';
    }).join('');
    show(top(2, true) + caseChip(c) +
      '<h1 class="asst__h">מה כבר נעשה?</h1>' +
      '<p class="asst__sub">סמנו רק מה שנכון אצלכם. אפשר גם להמשיך בלי לסמן.</p>' +
      (skippedState && c.safety ? '<p class="asst__safety" role="note">' + icon('alert') + '<span>' + esc(c.safety) + '</span></p>' : '') +
      '<ul class="asst__ticks">' + items + '</ul>' +
      '<button type="button" class="asst__go" data-next>הכינו לי את המסמך' + icon('arrow') + '</button>',
      famColor(c));
    on('[data-ask]', 'click', function (b) {
      var id = b.getAttribute('data-ask');
      st.done[id] = !st.done[id];
      b.setAttribute('aria-pressed', st.done[id] ? 'true' : 'false');
    });
    on('[data-back]', 'click', function () { st.stateId = ''; stateScreen(); });
    on('[data-next]', 'click', prepScreen);
  }

  function split(c) {
    var out = { done: [], missing: [], flags: [] };
    c.asked.forEach(function (a) {
      if (a.risk) { if (st.done[a.id]) { out.flags.push(a); } return; }
      (st.done[a.id] ? out.done : out.missing).push(a);
    });
    return out;
  }

  /* ---------- preparing the document ----------
     A short, honest pause: every line names something the document really contains,
     in the order it is put together. About 3s; about a second with reduced motion. */
  function prepScreen() {
    var c = theCase(), s = theState();
    if (!c) { return picker(); }
    if (!s) { return stateScreen(); }
    var parts = split(c), total = parts.done.length + parts.missing.length;
    var lines = [
      'סוג הנזק: <b>' + esc(c.label) + '</b>',
      'המצב: <b>' + esc(s.label) + '</b>',
      'מה כבר נעשה: <b>' + parts.done.length + ' מתוך ' + total + '</b>',
      'מה עוד חסר בתיעוד',
      theRuling(c, s) ? 'מקרה דומה שהגיע לבית המשפט' : 'איפה מקרים כאלה נתקעים',
      'הצעד הבא שלכם'
    ];
    var tip = c.tip ? '<aside class="prep__tip" data-tip><p class="prep__tip-label">' + icon('bulb') + 'טיפ בינתיים</p>' +
      '<p class="prep__tip-text">' + esc(c.tip) + '</p></aside>' : '';
    show('<div class="prep">' + logo('is-working') +
      '<h1 class="asst__h">מכינים את המסמך שלכם</h1>' +
      '<p class="prep__sub">עוד רגע</p>' +
      '<ul class="prep__list">' + lines.map(function (l) {
        return '<li class="prep__item"><span class="prep__mark">' + icon('tick') + '</span><span>' + l + '</span></li>';
      }).join('') + '</ul>' + tip + '</div>', famColor(c));

    var items = root.querySelectorAll('.prep__item');
    var tipEl = root.querySelector('[data-tip]');
    var mark = root.querySelector('.tlogo');
    // about 4.5s: long enough to read the tip
    var step = reduceMotion ? 300 : 635, work = reduceMotion ? 200 : 486;
    if (tipEl) { timers.push(window.setTimeout(function () { tipEl.classList.add('is-on'); }, reduceMotion ? 0 : 200 + step)); }
    Array.prototype.forEach.call(items, function (el, i) {
      timers.push(window.setTimeout(function () { el.classList.add('is-on'); }, 200 + i * step));
      timers.push(window.setTimeout(function () { el.classList.remove('is-on'); el.classList.add('is-ok'); }, 200 + i * step + work));
    });
    var end = 200 + (items.length - 1) * step + work;
    timers.push(window.setTimeout(function () { mark.classList.remove('is-working'); mark.classList.add('is-done'); }, end));
    timers.push(window.setTimeout(docScreen, end + (reduceMotion ? 300 : 608)));
  }

  /* ---------- the document ---------- */
  function summaryLines(c, s, parts, withContact) {
    var names = function (list, key) { return list.map(function (a) { return a[key]; }); };
    var lines = ['שלום, זה הסיכום מהעוזר באתר טביב שמאות.'];
    if (withContact) { lines.push('שם: ' + st.name, 'טלפון: ' + st.phone, 'אימייל: ' + st.email); }
    lines.push('הנזק: ' + c.label, 'המצב: ' + s.label);
    lines.push('כבר נעשה: ' + (parts.done.length ? names(parts.done, 'q').join(' · ') : 'עוד לא'));
    if (parts.flags.length) { lines.push('לתשומת לב: ' + names(parts.flags, 'q').join(' · ')); }
    lines.push('אשמח לבדיקת התאמה ראשונית.');
    return lines;
  }
  function waUrl(lines) { return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(lines.join('\n')); }

  function lockedHtml(c, s, parts) {
    var T = data.doc.sections, r = theRuling(c, s), html = '';
    if (parts.missing.length) {
      html += '<section class="report__block"><h2 class="report__label">' + icon('search') + esc(T.missing) + ' (' + parts.missing.length + ')</h2>' +
        '<ul class="report__list is-todo">' + parts.missing.map(function (a) {
          return '<li>' + icon(a.icon) + '<span>' + esc(a.miss) + '</span></li>';
        }).join('') + '</ul></section>';
    }
    var stuck = c.doc.stuck, cut = stuck.indexOf('. ');
    html += '<section class="report__block"><h2 class="report__label">' + icon('alert') + esc(T.stuck) + '</h2>' +
      '<p class="report__lead">' + esc(cut > 0 ? stuck.slice(0, cut + 1) : stuck) + '</p>' +
      (cut > 0 ? '<p class="report__text">' + esc(stuck.slice(cut + 2)) + '</p>' : '') + '</section>';
    if (r) {
      html += '<section class="report__block"><h2 class="report__label">' + icon('scale') + esc(T.ruling) +
        (r.verified ? '' : '<span class="report__draft">טיוטה לאימות</span>') + '</h2>' +
        '<p class="report__text">' + esc(r.story) + '</p>' +
        '<p class="report__text is-dim">' + esc(r.differs) + '</p>' +
        '<p class="report__ask"><small>השאלה אצלכם</small>' + esc(r.ask) + '</p>' +
        '<p class="report__ref">' + esc(r.court) + ', ' + esc(r.year) + ' · <span dir="rtl">' + esc(r.number) + '</span></p>' +
        '<p class="report__ref">' + esc(data.doc.rulingNote) + '</p></section>';
    }
    html += '<section class="report__block"><h2 class="report__label">' + icon('check') + esc(T.appraiser) + '</h2>' +
      '<ul class="report__list is-fam">' + c.doc.appraiser.map(function (t) {
        return '<li>' + icon('tick') + '<span>' + esc(t) + '</span></li>';
      }).join('') + '</ul></section>';
    return html;
  }

  function gateHtml(c, s, parts) {
    var T = data.doc.sections, r = theRuling(c, s);
    var inside = [];
    if (parts.missing.length) { inside.push(T.missing + ' (' + parts.missing.length + ')'); }
    inside.push(T.stuck);
    if (r) { inside.push(T.ruling); }
    inside.push(T.appraiser);
    return '<form class="gate" novalidate autocomplete="on" data-gate>' +
      '<p class="gate__title">' + icon('lock') + 'המסמך המלא נפתח אחרי השארת פרטים</p>' +
      '<ul class="gate__inside">' + inside.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '<label class="gate__field"><span>שם</span>' +
        '<input type="text" name="full_name" autocomplete="name" enterkeyhint="next" value="' + esc(st.name) + '"></label>' +
      '<label class="gate__field"><span>טלפון נייד</span>' +
        '<input type="tel" name="phone_raw" inputmode="tel" autocomplete="tel" dir="ltr" enterkeyhint="next" placeholder="050-0000000" value="' + esc(st.phone) + '"></label>' +
      '<label class="gate__field"><span>אימייל</span>' +
        '<input type="email" name="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" dir="ltr" enterkeyhint="done" placeholder="name@example.com" value="' + esc(st.email) + '"></label>' +
      '<input class="gate__hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<p class="gate__error" role="alert" hidden></p>' +
      '<button type="submit" class="asst__go">פתיחת המסמך המלא</button>' +
      '<p class="gate__consent">' + esc(data.doc.consent) + ' <a href="' + esc(PATHS.legal || '/legal/') + '">לקריאה</a></p>' +
      (DEMO ? '<p class="gate__consent">דמו: הפרטים לא נשלחים לשום מקום.</p>' : '') +
      '</form>';
  }

  function afterHtml(c, s, parts) {
    return '<p class="gate__open" role="status">' + icon('tick') + 'המסמך פתוח. הפרטים התקבלו.</p>' +
      '<a class="asst__go asst__go--wa" href="' + esc(waUrl(summaryLines(c, s, parts, true))) + '" rel="noopener">' +
        icon('whatsapp') + 'שליחת הסיכום בוואטסאפ</a>' +
      '<p class="asst__note">ההודעה כבר כתובה, עם הפרטים שלכם. היא נשלחת לטביב שמאות ונשארת אצלכם בשיחה.</p>' +
      (c.guide ? '<a class="asst__guide" href="' + esc(c.guide.url) + '"><small>לקריאה בזמנכם</small>' + esc(c.guide.title) + '</a>' : '');
  }

  function docScreen() {
    var c = theCase(), s = theState();
    if (!c) { return picker(); }
    if (!s) { return stateScreen(); }
    var parts = split(c);
    var today = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });

    show(top(3, false) +
      '<h1 class="asst__h">המסמך שלכם מוכן</h1>' +
      '<article class="report" aria-label="' + esc(data.doc.title) + '">' +
        '<header class="report__head">' + logo('is-done') +
          '<span class="report__title">' + esc(data.doc.title) + '</span><span class="report__date">' + esc(today) + '</span></header>' +
        '<dl class="report__rows">' +
          '<div class="report__row is-fam">' + icon(c.icon) + '<dt>הנזק</dt><dd>' + esc(c.label) + '</dd></div>' +
          '<div class="report__row">' + icon(s.icon) + '<dt>המצב</dt><dd>' + esc(s.label) + '</dd></div>' +
        '</dl>' +
        (c.safety ? '<p class="report__safety">' + icon('alert') + '<span>' + esc(c.safety) + '</span></p>' : '') +
        parts.flags.map(function (a) {
          return '<p class="report__safety">' + icon('alert') + '<span>' + esc(a.flag) + '</span></p>';
        }).join('') +
        '<div class="report__next"><p class="report__label">הצעד הבא</p><p>' + esc(s.next) + '</p></div>' +
        (parts.done.length ? '<div class="report__block"><p class="report__label">כבר נעשה</p><ul class="report__list is-done">' +
          parts.done.map(function (a) { return '<li>' + icon('tick') + '<span>' + esc(a.q) + '</span></li>'; }).join('') + '</ul></div>' : '') +
        '<div class="locked' + (st.unlocked ? ' is-open' : '') + '" data-locked>' + lockedHtml(c, s, parts) + '</div>' +
      '</article>' +
      '<div data-after>' + (st.unlocked ? afterHtml(c, s, parts) : gateHtml(c, s, parts)) + '</div>' +
      '<p class="asst__legal">המידע כללי ואינו ייעוץ משפטי או ביטוחי. ' +
        '<a href="' + esc(PATHS.legal || '/legal/') + '">מדיניות פרטיות ותנאי שימוש</a></p>',
      famColor(c));

    var locked = root.querySelector('[data-locked]');
    if (!st.unlocked) { locked.setAttribute('aria-hidden', 'true'); locked.setAttribute('inert', ''); }
    bindGate(c, s, parts);
  }

  /* ---------- leaving details opens the rest ---------- */
  function validEmail(raw) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((raw || '').trim());
  }
  function validPhone(raw) {
    var d = (raw || '').replace(/[\s\-()]/g, '');
    return /^05\d{8}$/.test(d) || /^\+9725\d{8}$/.test(d) || /^9725\d{8}$/.test(d);
  }
  function newLeadId() {
    var bytes = new Uint8Array(32), hex = '';
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    for (var i = 0; i < bytes.length; i++) { hex += ('0' + bytes[i].toString(16)).slice(-2); }
    return 'LD-' + hex;
  }

  // same record the /check/ form saves, so the lead lands in the same place
  function sendLead(c, s, parts, honeypot) {
    if (DEMO) { return new Promise(function (ok) { window.setTimeout(ok, 500); }); }
    if (!cfg.endpointUrl || typeof fetch !== 'function') { return Promise.reject(new Error('no_endpoint')); }
    var A = window.ATTRIBUTION, rec = A && A.get ? A.get() : {};
    var names = function (list) { return list.map(function (a) { return a.q; }).join(' · ') || 'עוד לא'; };
    var body = {
      lead_id: st.leadId,
      source: A && A.source ? A.source() : '',
      cta_location: 'assistant_document',
      service_interest: '', service_price_revealed: '', service_log: '',
      browser_context: '',
      damage_type: c.intake || 'OTHER',
      case_state: s.intake || 'UNSURE',
      full_name: st.name,
      phone_raw: st.phone,
      email: st.email,
      property_city: '',
      short_description: ('[העוזר] ' + c.label + ' | ' + s.label + ' | נעשה: ' + names(parts.done) +
        (parts.flags.length ? ' | לתשומת לב: ' + names(parts.flags) : '')).slice(0, 1000),
      notice_version: LEGAL_RELEASE,
      policy_version: LEGAL_RELEASE,
      client_marker: cfg.clientMarker || '',
      honeypot: honeypot || '',
      form_started_at: startedAt,
      utm_source: rec.utm_source || '', utm_medium: rec.utm_medium || '', utm_campaign: rec.utm_campaign || '',
      utm_content: rec.utm_content || '', utm_term: rec.utm_term || '', fbclid: rec.fbclid || '',
      referrer: rec.referrer || '', landing_route: rec.landing_route || '', source_page: 'assistant'
    };
    return fetch(cfg.endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) { throw new Error('http_error'); } return r.json(); });
  }

  function bindGate(c, s, parts) {
    var form = root.querySelector('[data-gate]');
    if (!form) { return; }
    var err = form.querySelector('.gate__error');
    var btn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.elements.full_name, phone = form.elements.phone_raw, email = form.elements.email;
      var bad = null, msg = '';
      if (name.value.trim().length < 2) { bad = name; msg = 'צריך שם כדי לפתוח את המסמך.'; }
      else if (!validPhone(phone.value)) { bad = phone; msg = 'צריך מספר נייד מלא, למשל 050-1234567.'; }
      else if (!validEmail(email.value)) { bad = email; msg = 'צריך כתובת אימייל מלאה, למשל name@gmail.com.'; }
      [name, phone, email].forEach(function (el) { el.removeAttribute('aria-invalid'); });
      if (bad) {
        bad.setAttribute('aria-invalid', 'true');
        err.textContent = msg; err.hidden = false;
        bad.focus();
        return;
      }
      err.hidden = true;
      st.name = name.value.trim(); st.phone = phone.value.trim(); st.email = email.value.trim();
      if (!st.leadId) { st.leadId = newLeadId(); }
      btn.disabled = true; btn.textContent = 'פותחים את המסמך…';
      var open = function () { st.unlocked = true; save(); unlock(c, s, parts); };
      // the visitor did their part: the document opens even if saving fails,
      // and the WhatsApp message carries the same details
      sendLead(c, s, parts, form.elements.website.value).then(open, open);
    });
  }

  function unlock(c, s, parts) {
    var locked = root.querySelector('[data-locked]');
    var after = root.querySelector('[data-after]');
    if (!locked || !after) { return; }
    locked.classList.add('is-open');
    locked.removeAttribute('aria-hidden');
    locked.removeAttribute('inert');
    after.innerHTML = afterHtml(c, s, parts);
    var first = locked.querySelector('.report__label');
    if (first) {
      first.setAttribute('tabindex', '-1');
      first.focus({ preventScroll: true });
      locked.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }

  fetch(CASES_URL).then(function (r) { return r.json(); }).then(function (json) {
    data = json;
    if (theCase()) { start(); } else { picker(); }
  }).catch(function () {
    root.innerHTML = '<h1 class="asst__h">אפשר להמשיך ישירות</h1>' +
      '<a class="asst__go asst__go--wa" href="https://wa.me/' + WA_NUMBER + '" rel="noopener">' +
      icon('whatsapp') + 'פנייה בוואטסאפ</a>' +
      '<a class="asst__alt" href="' + (PATHS.check || '/check/') + '">או השארת פרטים</a>';
  });
}());
