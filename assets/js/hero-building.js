(function () {
  'use strict';

  var hero = document.getElementById('tv-hero');
  if (!hero) { return; }

  var PATHS = window.TAVIV_PATHS || {};
  var CASES_URL = PATHS.cases || '/cases/cases.json';
  var ASSISTANT = PATHS.assistant || '/assistant/';
  var icon = window.TAVIV_ICON || function () { return ''; };

  var FRAME_W = 600, FRAME_H = 1066;

  // Where each case sits on the frontal frame, in frame pixels. This is geometry
  // of the picture; every word shown comes from cases/cases.json.
  // side: which street margin the label sits in · dot: where the damage is.
  var GEO = {
    shared:     { box: [200, 222, 500, 304], dot: [395, 265], tagAt: { right: 196, top: 234 } },
    roof:       { box: [150, 305, 288, 445], dot: [218, 330], side: 'left' },
    fire:       { box: [338, 305, 500, 445], dot: [420, 330], side: 'right' },
    pipes:      { box: [150, 450, 288, 578], dot: [200, 540], side: 'left' },
    structural: { box: [338, 450, 500, 578], dot: [430, 490], side: 'right' },
    neighbor:   { box: [150, 582, 288, 700], dot: [213, 620], side: 'left' },
    burglary:   { box: [338, 582, 500, 700], dot: [400, 650], side: 'right' },
    business:   { box: [150, 704, 500, 834], dot: [205, 760], side: 'left' },
    unsure:     { box: [70, 735, 150, 850],  dot: null,       tagAt: { left: 56, top: 853 } }
  };

  var pct = function (v, total) { return (v / total * 100) + '%'; };
  var pendingState = (location.search.match(/[?&]state=([a-z]+)/) || [])[1] || '';
  var layer = hero.querySelector('.tv-layer');
  var video = hero.querySelector('video');
  var lastTrigger = null;

  /* ---------- the bubble ---------- */
  var sheet = document.createElement('div');
  sheet.className = 'tv-sheet';
  sheet.innerHTML =
    '<button type="button" class="tv-sheet__backdrop" tabindex="-1" aria-label="סגירה"></button>' +
    '<div class="tv-sheet__card" role="dialog" aria-modal="true" aria-labelledby="tv-sheet-name">' +
      '<button type="button" class="tv-sheet__close" aria-label="סגירה">' + icon('close') + '</button>' +
      '<p class="tv-sheet__name" id="tv-sheet-name"></p>' +
      '<p class="tv-sheet__hook"></p>' +
      '<a class="tv-sheet__cta" href="' + ASSISTANT + '"><span>מה עושים עכשיו?</span>' + icon('arrow') + '</a>' +
      '<p class="tv-sheet__note">3 צעדים קצרים עם העוזר של טביב שמאות. ללא עלות.</p>' +
    '</div>';
  document.body.appendChild(sheet);

  var card = sheet.querySelector('.tv-sheet__card');
  var sName = sheet.querySelector('.tv-sheet__name');
  var sHook = sheet.querySelector('.tv-sheet__hook');
  var sCta = sheet.querySelector('.tv-sheet__cta');
  var sClose = sheet.querySelector('.tv-sheet__close');

  function assistantUrl(id) {
    var keep = [];
    location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
      if (kv && !/^(case|state)=/.test(kv)) { keep.push(kv); }
    });
    return ASSISTANT + '?case=' + encodeURIComponent(id) +
      (pendingState ? '&state=' + encodeURIComponent(pendingState) : '') +
      (keep.length ? '&' + keep.join('&') : '');
  }

  function openSheet(c, fam, trigger) {
    lastTrigger = trigger || null;
    card.style.setProperty('--fam', fam.color);
    sName.innerHTML = icon(c.icon) + '<span></span>';
    sName.lastChild.textContent = c.label;
    sHook.textContent = c.hook;
    sCta.setAttribute('href', assistantUrl(c.id));
    Array.prototype.forEach.call(layer.querySelectorAll('.tv-zone'), function (z) {
      z.classList.toggle('is-active', z.getAttribute('data-case') === c.id);
    });
    sheet.classList.add('is-open');
    window.setTimeout(function () { sClose.focus(); }, 60);
  }

  function closeSheet() {
    if (!sheet.classList.contains('is-open')) { return; }
    sheet.classList.remove('is-open');
    Array.prototype.forEach.call(layer.querySelectorAll('.tv-zone.is-active'), function (z) {
      z.classList.remove('is-active');
    });
    if (lastTrigger && lastTrigger.focus) { lastTrigger.focus(); }
  }

  sClose.addEventListener('click', closeSheet);
  sheet.querySelector('.tv-sheet__backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeSheet(); }
    if (e.key === 'Tab' && sheet.classList.contains('is-open')) {
      // two focusable controls: keep focus inside the bubble
      var first = sClose, last = sCta;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- labels and hit areas, drawn from the data file ---------- */
  function draw(data) {
    data.cases.forEach(function (c) {
      var g = GEO[c.id];
      if (!g) { return; }
      var fam = data.families[c.family] || { color: '#A7AFB5' };
      var b = g.box;

      // The page is RTL, where logical insets flip: use physical left/right/top.
      var zone = document.createElement('button');
      zone.type = 'button';
      zone.className = 'tv-zone';
      zone.setAttribute('data-case', c.id);
      zone.setAttribute('aria-label', c.label);
      zone.style.setProperty('--fam', fam.color);
      zone.style.left = pct(b[0], FRAME_W);
      zone.style.top = pct(b[1], FRAME_H);
      zone.style.width = pct(b[2] - b[0], FRAME_W);
      zone.style.height = pct(b[3] - b[1], FRAME_H);
      zone.addEventListener('click', function () { openSheet(c, fam, zone); });
      layer.appendChild(zone);

      var tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'tv-tag';
      tag.setAttribute('tabindex', '-1');       // the zone already carries keyboard focus
      tag.setAttribute('aria-hidden', 'true');
      tag.textContent = c.short || c.label;
      tag.style.setProperty('--fam', fam.color);
      if (g.tagAt) {
        if (g.tagAt.left !== undefined) { tag.style.left = pct(g.tagAt.left, FRAME_W); }
        if (g.tagAt.right !== undefined) { tag.style.right = pct(FRAME_W - g.tagAt.right, FRAME_W); }
        tag.style.top = pct(g.tagAt.top, FRAME_H);
      } else if (g.side === 'left') {
        tag.style.right = pct(FRAME_W - (b[0] - 6), FRAME_W);
        tag.style.top = pct(b[1] + 6, FRAME_H);
      } else {
        tag.style.left = pct(b[2] + 6, FRAME_W);
        tag.style.top = pct(b[1] + 6, FRAME_H);
      }
      tag.addEventListener('click', function () { openSheet(c, fam, zone); });
      layer.appendChild(tag);

      if (g.dot) {
        var dot = document.createElement('i');
        dot.className = 'tv-dot';
        dot.style.setProperty('--fam', fam.color);
        dot.style.left = pct(g.dot[0], FRAME_W);
        dot.style.top = pct(g.dot[1], FRAME_H);
        dot.style.animationDelay = (Math.random() * 2.4).toFixed(2) + 's';
        layer.appendChild(dot);
      }
    });
  }

  fetch(CASES_URL).then(function (r) { return r.json(); }).then(function (data) {
    draw(data);
    if (location.hash === '#tv-hero' || pendingState) {
      window.setTimeout(function () { callToBuilding(pendingState); }, 120);
    }
  }).catch(function () {
    // without the data file the picture still links somewhere useful
    hero.addEventListener('click', function () { location.href = ASSISTANT; });
  });

  /* ---------- every route to the assistant goes through the building ---------- */
  var ask = document.querySelector('.s1-hero__ask');
  var askHtml = ask ? ask.innerHTML : '';
  var section = document.getElementById('s1-hero') || hero;
  var callTimer = 0;

  function callToBuilding(stateId) {
    if (stateId) { pendingState = stateId; }
    skipIntro();
    Array.prototype.forEach.call(document.querySelectorAll('[data-pick-building][data-state]'), function (el) {
      el.classList.toggle('is-picked', el.getAttribute('data-state') === pendingState);
    });
    if (ask) {
      ask.innerHTML = pendingState ? '<strong>עכשיו בחרו בבניין</strong> היכן הופיע הנזק.' : askHtml;
      ask.setAttribute('role', 'status');
    }
    var target = (ask && window.matchMedia('(max-width: 767px)').matches) ? ask : hero;
    target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    section.classList.remove('is-calling');
    void section.offsetWidth;
    section.classList.add('is-calling');
    window.clearTimeout(callTimer);
    callTimer = window.setTimeout(function () { section.classList.remove('is-calling'); }, 4200);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-pick-building]'), function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      callToBuilding(el.getAttribute('data-state') || '');
    });
  });

  /* ---------- the arrival clip: never in the way ---------- */
  var settled = false;
  // labels only line up with the frontal frame, so a skip always lands on it
  function skipIntro() {
    if (settled) { return; }
    // dropping the sources brings back the poster, which is the frontal frame;
    // seeking to the end is not reliable on every phone
    settle();
    try {
      if (video && video.querySelector('source')) {
        video.pause();
        Array.prototype.forEach.call(video.querySelectorAll('source'), function (n) { n.remove(); });
        video.load();
      }
    } catch (e) {}
  }
  function settle() {
    if (settled) { return; }
    settled = true;
    hero.classList.add('is-settled');
    try { sessionStorage.setItem('tv_intro_seen', '1'); } catch (e) {}
  }

  var wantsStill = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  var seen = false;
  try { seen = sessionStorage.getItem('tv_intro_seen') === '1'; } catch (e) {}

  if (!video || !video.canPlayType || wantsStill || saveData || seen) {
    settle();
    return;
  }

  // a touch or click on the building skips the clip
  hero.addEventListener('pointerdown', skipIntro);

  // The arrival is the second half of the hero loop already on the site: from the
  // three-quarter view at 10s back to the frontal frame at the end (the poster).
  var ARRIVE_FROM = 10, RATE = 1.8;
  var started = false;
  function start() {
    if (started || settled) { return; }
    started = true;
    var media = PATHS.media || 'assets/media/';
    var sources = [['webm', media + 'building-loop.webm'], ['mp4', media + 'building-loop.mp4']];
    sources.forEach(function (pair, i) {
      var s = document.createElement('source');
      s.src = pair[1] + '#t=' + ARRIVE_FROM;
      s.type = 'video/' + pair[0];
      // if the last source fails there is no clip: show the labels now
      if (i === sources.length - 1) { s.addEventListener('error', settle); }
      video.appendChild(s);
    });
    video.preload = 'auto';
    video.muted = true;
    video.defaultPlaybackRate = RATE;
    video.addEventListener('loadedmetadata', function () {
      if (video.currentTime < ARRIVE_FROM - 0.5) {
        try { video.currentTime = ARRIVE_FROM; } catch (e) {}
      }
    });
    video.addEventListener('playing', function () {
      if (video.playbackRate !== RATE) { video.playbackRate = RATE; }
    });
    video.addEventListener('ended', settle);
    video.addEventListener('error', settle);
    video.load();
    var played = video.play();
    if (played && played.catch) { played.catch(skipIntro); }
    // a slow connection must not leave the labels waiting, and labels never sit on a turned frame
    window.setTimeout(skipIntro, 9000);
  }

  if (document.readyState === 'complete') { start(); }
  else {
    window.addEventListener('load', start, { once: true });
    window.setTimeout(start, 1500);
  }
}());
