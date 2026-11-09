(function () {
  'use strict';

  var hero = document.getElementById('tv-hero');
  if (!hero) { return; }

  var FRAME_W = 600, FRAME_H = 1066;
  var CHECK = '/check/';

  // box: [x0, y0, x1, y1] in frame pixels · dot: where the damage actually is
  var ZONES = [
    { q: 'roof',       side: 'start', box: [150, 305, 288, 445], dot: [218, 330],
      tag: 'מים מהגג',    title: 'אחרי האיטום',
      body: 'המים שנכנסו מהגג לא נעלמים עם האיטום. צלמו את הכתמים לפני שצובעים, כדי שאפשר יהיה להעריך מה נשאר.' },
    { q: 'fire',       side: 'end',   box: [338, 305, 500, 445], dot: [420, 330],
      tag: 'שריפה',       title: 'לפני הפינוי',
      body: 'עשן ופיח מגיעים גם לחדרים שהאש לא הגיעה אליהם. ברגע שבטוח להיכנס, צלמו הכול לפני שמנקים.' },
    { q: 'pipes',      side: 'start', box: [150, 450, 288, 578], dot: [200, 540],
      tag: 'צנרת בדירה',  title: 'מעבר לצינור',
      body: 'הצינור תוקן, אבל הרטיבות נשארת לפעמים בקיר ומתחת לריצוף. דוח של בעל המקצוע עוזר להפריד בין השניים.' },
    { q: 'structural', side: 'end',   box: [338, 450, 500, 578], dot: [430, 490],
      tag: 'סדקים בקיר',  title: 'לפני מילוי הסדק',
      body: 'סדק שמולא כבר אי אפשר לבדוק. צלמו עם תאריך, ואם יש חשש בטיחותי פנו למהנדס קודם.' },
    { q: 'neighbor',   side: 'start', box: [150, 582, 288, 700], dot: [213, 620],
      tag: 'נזילה מהשכן', title: 'הנזילה נעצרה',
      body: 'רטיבות מלמעלה לא אומרת מי אחראי. דוח האיתור והתמונות הם מה שמחבר בין המקור לנזק.' },
    { q: 'burglary',   side: 'end',   box: [338, 582, 500, 700], dot: [400, 650],
      tag: 'פריצה',       title: 'מה חסר ומה נפגע',
      body: 'אחרי פריצה יש גם מה שנלקח וגם מה שנשבר. אישור המשטרה, תמונות וקבלות מכסים את שניהם.' },
    { q: 'business',   side: 'start', box: [150, 704, 500, 834], dot: [205, 760],
      tag: 'נזק בעסק',    title: 'מה צריך לשקם',
      body: 'בעסק נפגעים מבנה, ציוד ומלאי, ולא תמיד של אותו בעלים. רישומי המלאי והחשבוניות קובעים מה שייך למי.' },
    { q: 'shared',     side: 'end',   box: [200, 222, 500, 304], dot: [395, 265],
      tagAt: { left: 506, top: 236 },
      tag: 'רכוש משותף',  title: 'ברכוש המשותף',
      body: 'נזק במערכת משותפת מגיע לכמה דירות, ומיקום הרכיב לא קובע למי הוא שייך. דוחות התחזוקה וקריאות השירות עושים סדר.' },
    { q: 'unsure',     side: 'start', box: [100, 740, 148, 845], dot: null,
      tagAt: { left: 60, top: 852 },
      tag: 'עוד לא ברור', title: 'עוד לא ברור מה קרה',
      body: 'לא תמיד ברור מאיפה הנזק הגיע ומה הוא כולל. אפשר להתחיל משיחה קצרה ולעשות סדר משם.' }
  ];

  var pct = function (v, total) { return (v / total * 100) + '%'; };

  var layer = hero.querySelector('.tv-layer');
  var panel = hero.querySelector('.tv-panel');
  var pTag = panel.querySelector('.tv-panel__tag');
  var pTitle = panel.querySelector('.tv-panel__title');
  var pBody = panel.querySelector('.tv-panel__body');
  var pLink = panel.querySelector('.tv-panel__cta');
  var pClose = panel.querySelector('.tv-panel__close');

  function open(z) {
    pTag.textContent = z.tag;
    pTitle.textContent = z.title;
    pBody.textContent = z.body;
    pLink.setAttribute('href', CHECK + '?floor=' + z.q + (location.search ? '&' + location.search.slice(1) : ''));
    hero.classList.add('is-open');
    pClose.focus();
  }

  function close() { hero.classList.remove('is-open'); }

  pClose.addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && hero.classList.contains('is-open')) { close(); }
  });

  ZONES.forEach(function (z) {
    var b = z.box;

    // NOTE: the document is RTL, so logical inset properties flip. Everything
    // here is positioned with physical left/right/top against the frame box.
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tv-zone';
    btn.setAttribute('aria-label', z.tag + ' — ' + z.title);
    btn.style.left = pct(b[0], FRAME_W);
    btn.style.top = pct(b[1], FRAME_H);
    btn.style.width = pct(b[2] - b[0], FRAME_W);
    btn.style.height = pct(b[3] - b[1], FRAME_H);
    btn.addEventListener('click', function () { open(z); });
    layer.appendChild(btn);

    var tag = document.createElement('span');
    tag.className = 'tv-tag';
    tag.textContent = z.tag;
    if (z.tagAt) {
      if (z.tagAt.left !== undefined) { tag.style.left = pct(z.tagAt.left, FRAME_W); }
      if (z.tagAt.right !== undefined) { tag.style.right = pct(FRAME_W - z.tagAt.right, FRAME_W); }
      tag.style.top = pct(z.tagAt.top, FRAME_H);
    } else if (z.side === 'start') {
      tag.style.right = pct(FRAME_W - (b[0] - 6), FRAME_W);
      tag.style.top = pct(b[1] + 6, FRAME_H);
    } else {
      tag.style.left = pct(b[2] + 6, FRAME_W);
      tag.style.top = pct(b[1] + 6, FRAME_H);
    }
    layer.appendChild(tag);

    if (z.dot) {
      var dot = document.createElement('i');
      dot.className = 'tv-dot';
      dot.style.left = pct(z.dot[0], FRAME_W);
      dot.style.top = pct(z.dot[1], FRAME_H);
      dot.style.animationDelay = (Math.random() * 2.4).toFixed(2) + 's';
      layer.appendChild(dot);
    }
  });

  // --- the intro clip: play once, settle on the frontal frame, then reveal ---
  var video = hero.querySelector('video');
  var wantsStill = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = navigator.connection && navigator.connection.saveData;

  function settle() { hero.classList.add('is-settled'); }

  if (!video || !video.canPlayType || wantsStill || saveData) {
    settle();
    return;
  }

  var started = false;
  function start() {
    if (started) { return; }
    started = true;
    [['webm', 'assets/media/building-intro.webm'],
     ['mp4', 'assets/media/building-intro.mp4']].forEach(function (pair) {
      var s = document.createElement('source');
      s.src = pair[1];
      s.type = 'video/' + pair[0];
      video.appendChild(s);
    });
    video.preload = 'auto';
    video.muted = true;
    video.load();
    var played = video.play();
    if (played && played.catch) { played.catch(settle); }
    video.addEventListener('ended', settle);
    window.setTimeout(settle, 13000);
  }

  if (document.readyState === 'complete') { start(); }
  else {
    window.addEventListener('load', start, { once: true });
    window.setTimeout(start, 2500);
  }
}());
