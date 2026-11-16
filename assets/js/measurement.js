(function () {
  'use strict';

  var SCHEMA_VERSION = 'taviv_measurement_v1';
  var CONTENT_VERSION = 'site_2026_09_09_1';
  var TEST_MODE = window.TAVIV_MEASUREMENT_TEST_MODE === true;
  var TEST_EVENTS = [];
  var onceSeen = {};
  var recentSeen = {};
  var eventIdsSeen = {};
  var MAX_SEEN = 300;

  // Microsoft Clarity: masking Strict and cookies off in the Clarity project settings.
  // It loads only after the visitor agrees in the banner (privacy policy, section 16).
  // The id is public (it appears in the page anyway); it is not a key.
  var CLARITY_PROJECT_ID = 'zbeqvw0p4u';
  var CONSENT_KEY = 'tv_measure_consent';
  // 2026-11-16.1: two separate choices — usage measurement (Clarity) and advertising (Meta).
  // A record from an older version is ignored, so the visitor is asked again.
  var CONSENT_VERSION = '2026-11-16.1';
  var AD_LEADS_KEY = 'tv_ad_leads';          // lead ids sent to Meta with consent, for withdrawal
  var AD_LEADS_MAX_DAYS = 90;

  // Meta dataset (Pixel) id. Public by design (it appears in the page anyway); it is not a key.
  // Empty = the Pixel never loads and nothing is sent to Meta from the browser.
  var META_PIXEL_ID = '1669575897913253';

  var FEATURE_FLAGS = {
    ga4: false,
    clarity: /^[a-z0-9]{6,16}$/.test(CLARITY_PROJECT_ID),
    meta_pixel: /^[0-9]{10,20}$/.test(META_PIXEL_ID),
    google_ads: false
  };
  if (Object.freeze) Object.freeze(FEATURE_FLAGS);

  var ROUTES = {
    '/': 'home',
    '/damage/': 'damage',
    '/check/': 'check',
    '/assistant/': 'assistant',
    '/legal/': 'legal',
    '/404.html': 'not_found'
  };

  var SLUG = /^[a-z0-9][a-z0-9_-]{0,47}$/;
  var SHORT_SLUG = /^[a-z0-9][a-z0-9_-]{0,31}$/;
  var UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  var BLOCKED_KEYS = [
    'name', 'full_name', 'phone', 'phone_raw', 'email', 'address',
    'apartment', 'property_city', 'gps', 'free_text', 'message',
    'field_value', 'form_value', 'error_message', 'file_name', 'filename',
    'lead_id', 'case_id', 'claim_id', 'policy_id', 'page_location',
    'page_url', 'referrer', 'raw_referrer', 'user_agent'
  ];

  var ENUMS = {
    source_page: ['home', 'damage', 'check', 'assistant', 'legal', 'not_found'],
    landing_path: ['home', 'damage', 'check'],
    cta_location: ['header', 'hero', 'mid', 'pricing', 'faq', 'closing', 'sticky_mobile', 'success', 'assistant'],
    // the assistant: which kind of damage, which general stage, which screen
    damage_case: ['roof', 'fire', 'pipes', 'structural', 'neighbor', 'burglary', 'business', 'shared', 'unsure'],
    case_stage: ['now', 'checked', 'returned', 'dispute'],
    assistant_step: ['picker', 'state', 'asked', 'prep', 'document'],
    done_count: ['0', '1', '2', '3', '4'],
    device_category: ['mobile', 'tablet', 'desktop'],
    viewport_bucket: ['xs_320_359', 'sm_360_389', 'md_390_767', 'lg_768_1023', 'xl_1024_plus'],
    section_id: [
      'home_hero', 'home_role', 'home_independent', 'home_about', 'home_process', 'home_faq', 'home_urgency',
      'damage_hero', 'damage_source', 'damage_process', 'damage_trust', 'damage_pricing', 'damage_faq'
    ],
    cta_id: [
      'home_sticky_check', 'home_hero_check', 'home_faq_check',
      'damage_sticky_check', 'damage_hero_check', 'damage_mid_check', 'damage_pricing_entry',
      'damage_insurer_gap_check', 'damage_appraisal_only_check', 'damage_appraisal_managed_check',
      'damage_unsure_check', 'damage_remote_feasibility_check', 'damage_faq_check'
    ],
    faq_id: [
      'repair_vs_appraisal', 'neighbor_damage_documentation', 'independent_insurance_review', 'founder_purpose_and_balance',
      'suitability_before_full_report'
    ],
    intake_step_id: ['contact', 'damage_type', 'case_state'],
    field_id: ['full_name', 'phone_raw', 'email', 'property_city', 'short_description', 'damage_type', 'case_state'],
    service_interest: ['appraisal_only', 'appraisal_managed', 'remote_feasibility', 'insurer_gap'],
    depth_percent: ['25', '50', '75', '90'],
    seconds_bucket: ['15', '30', '60', '120'],
    error_code: ['required', 'invalid_format', 'too_long', 'network_timeout', 'network_error', 'server_rejected', 'rate_limited', 'unknown_safe'],
    handoff_mode: ['generic_whatsapp', 'public_code', 'fallback'],
    first_touch_source: ['google_paid', 'google_organic', 'meta_paid', 'meta_organic', 'whatsapp', 'referral', 'direct', 'other'],
    last_touch_source: ['google_paid', 'google_organic', 'meta_paid', 'meta_organic', 'whatsapp', 'referral', 'direct', 'other']
  };

  var COMMON = [
    'source_page', 'landing_path', 'content_version', 'page_variant',
    'device_category', 'viewport_bucket', 'event_id', 'section_id',
    'cta_location', 'cta_id', 'faq_id', 'intake_step_id', 'field_id',
    'error_code', 'depth_percent', 'seconds_bucket', 'handoff_mode',
    'first_touch_source', 'last_touch_source', 'outbound_domain',
    'service_interest', 'duplicate',
    'damage_case', 'case_stage', 'assistant_step', 'done_count'
  ];

  var EVENTS = {
    page_view: spec(['source_page', 'content_version', 'device_category', 'viewport_bucket'], [], ['home', 'damage', 'check', 'assistant', 'not_found'], true, ['source_page']),
    landing_view: spec(['landing_path', 'first_touch_source'], ['content_version', 'page_variant'], ['home', 'damage', 'check'], true, ['landing_path']),
    section_view: spec(['source_page', 'section_id'], ['page_variant'], ['home', 'damage'], true, ['source_page', 'section_id']),
    navigation_click: spec(['source_page', 'section_id'], ['cta_location'], ['home', 'damage', 'check', 'legal'], false, ['source_page', 'section_id']),
    outbound_click: spec(['source_page', 'outbound_domain'], ['section_id'], ['home', 'damage', 'check', 'legal'], false, ['source_page', 'outbound_domain']),
    scroll_depth: spec(['source_page', 'depth_percent'], [], ['home', 'damage'], true, ['source_page', 'depth_percent']),
    active_reading_time: spec(['source_page', 'seconds_bucket'], ['section_id'], ['home', 'damage'], true, ['source_page', 'seconds_bucket']),
    faq_open: spec(['source_page', 'faq_id'], ['section_id'], ['home', 'damage'], false, ['source_page', 'faq_id']),
    cta_view: spec(['source_page', 'cta_location', 'cta_id'], ['service_interest'], ['home', 'damage'], true, ['source_page', 'cta_id']),
    cta_click: spec(['source_page', 'cta_location', 'cta_id', 'event_id'], ['service_interest'], ['home', 'damage'], false, ['source_page', 'cta_id']),
    tel_click: spec(['source_page', 'cta_location', 'event_id'], [], ['home', 'damage', 'check', 'legal', 'not_found'], false, ['source_page', 'cta_location']),
    whatsapp_click: spec(['source_page', 'cta_location', 'event_id'], ['handoff_mode'], ['home', 'damage', 'check', 'assistant'], false, ['source_page', 'cta_location', 'handoff_mode']),
    intake_view: spec(['source_page'], ['first_touch_source'], ['check'], true, ['source_page']),
    intake_start: spec(['source_page', 'intake_step_id', 'event_id'], ['device_category', 'viewport_bucket'], ['check'], true, ['source_page']),
    intake_step_view: spec(['intake_step_id'], ['source_page'], ['check'], true, ['intake_step_id']),
    intake_step_complete: spec(['intake_step_id'], ['source_page'], ['check'], true, ['intake_step_id']),
    intake_validation_error: spec(['intake_step_id', 'field_id', 'error_code'], ['source_page', 'device_category'], ['check'], false, ['intake_step_id', 'field_id', 'error_code']),
    intake_submit_attempt: spec(['event_id', 'source_page'], ['intake_step_id'], ['check'], false, ['event_id']),
    intake_submit_success: spec(['event_id', 'source_page'], ['duplicate'], ['check'], true, ['event_id']),
    intake_submit_error: spec(['event_id', 'error_code'], ['source_page', 'intake_step_id'], ['check'], false, ['event_id', 'error_code']),
    // the assistant funnel: screen → document → details → open. No names, phones or free text.
    assistant_step_view: spec(['assistant_step'], ['damage_case', 'case_stage'], ['assistant'], true, ['assistant_step']),
    assistant_gate_error: spec(['field_id', 'error_code'], [], ['assistant'], false, ['field_id', 'error_code']),
    assistant_gate_submit: spec(['event_id', 'damage_case', 'case_stage'], ['done_count'], ['assistant'], false, ['event_id']),
    assistant_save_error: spec(['error_code'], [], ['assistant'], false, ['error_code']),
    assistant_unlock: spec(['damage_case', 'case_stage'], ['done_count'], ['assistant'], true, ['damage_case', 'case_stage']),
    assistant_pdf: spec(['source_page'], ['damage_case'], ['assistant'], false, ['source_page'])
  };

  function spec(required, optional, routes, once, signature) {
    return { required: required, optional: optional, routes: routes, once: once, signature: signature };
  }

  function own(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function currentPage() {
    var path = (window.location && window.location.pathname) || '/';
    path = path.replace(/\/index\.html$/, '/');
    return own(ROUTES, path) ? ROUTES[path] : '';
  }

  function deviceCategory() {
    var width = Math.max(0, Number(window.innerWidth) || 0);
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  function viewportBucket() {
    var width = Math.max(0, Number(window.innerWidth) || 0);
    if (width < 360) return 'xs_320_359';
    if (width < 390) return 'sm_360_389';
    if (width < 768) return 'md_390_767';
    if (width < 1024) return 'lg_768_1023';
    return 'xl_1024_plus';
  }

  function createEventId() {
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') return '';
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = [];
    for (var i = 0; i < bytes.length; i++) {
      hex.push((bytes[i] + 256).toString(16).slice(1));
    }
    return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' +
      hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' +
      hex.slice(10, 16).join('');
  }

  function looksSensitive(value) {
    if (typeof value !== 'string') return false;
    if (/@/.test(value)) return true;
    if (/https?:\/\//i.test(value) || /[?#]/.test(value)) return true;
    var digits = value.replace(/[^0-9]/g, '');
    return digits.length >= 8;
  }

  function enumValue(key, value) {
    return typeof value === 'string' && ENUMS[key].indexOf(value) !== -1 ? value : '';
  }

  function safeValue(key, value) {
    if (own(ENUMS, key)) return enumValue(key, value);
    if (key === 'event_id') return typeof value === 'string' && UUID_V4.test(value) ? value : '';
    if (key === 'duplicate') return typeof value === 'boolean' ? value : '';
    if (key === 'content_version') return value === CONTENT_VERSION ? value : '';
    if (key === 'page_variant') {
      return typeof value === 'string' && SLUG.test(value) && !looksSensitive(value) ? value : '';
    }
    if (key === 'outbound_domain') {
      return typeof value === 'string' && value.length <= 100 && /^[a-z0-9.-]+$/.test(value) && !looksSensitive(value) ? value : '';
    }
    return '';
  }

  function trimSeen(map) {
    var keys = Object.keys(map);
    if (keys.length <= MAX_SEEN) return;
    for (var i = 0; i < keys.length - MAX_SEEN; i++) delete map[keys[i]];
  }

  function signature(name, event, fields) {
    var values = [name];
    for (var i = 0; i < fields.length; i++) values.push(String(event[fields[i]] || ''));
    return values.join('|');
  }

  function trackEvent(name, params) {
    try {
      if (!own(EVENTS, name)) return false;
      var def = EVENTS[name];
      var page = currentPage();
      if (!page || def.routes.indexOf(page) === -1) return false;
      var input = params && typeof params === 'object' ? params : {};

      for (var blockedIndex = 0; blockedIndex < BLOCKED_KEYS.length; blockedIndex++) {
        if (own(input, BLOCKED_KEYS[blockedIndex])) return false;
      }

      var allowed = def.required.concat(def.optional);
      var event = { measurement_schema: SCHEMA_VERSION };
      for (var i = 0; i < COMMON.length; i++) {
        var key = COMMON[i];
        if (allowed.indexOf(key) === -1 || !own(input, key)) continue;
        var cleaned = safeValue(key, input[key]);
        if (cleaned !== '') event[key] = cleaned;
      }

      if (allowed.indexOf('source_page') !== -1) event.source_page = page;
      if (allowed.indexOf('content_version') !== -1) event.content_version = CONTENT_VERSION;
      if (allowed.indexOf('device_category') !== -1) event.device_category = deviceCategory();
      if (allowed.indexOf('viewport_bucket') !== -1) event.viewport_bucket = viewportBucket();
      if (allowed.indexOf('event_id') !== -1 && !event.event_id) event.event_id = createEventId();

      for (var requiredIndex = 0; requiredIndex < def.required.length; requiredIndex++) {
        if (!own(event, def.required[requiredIndex])) return false;
      }

      var eventIdKey = event.event_id ? name + '|' + event.event_id : '';
      if (eventIdKey && eventIdsSeen[eventIdKey]) return false;

      var sig = signature(name, event, def.signature);
      if (def.once) {
        if (onceSeen[sig]) return false;
        onceSeen[sig] = true;
        trimSeen(onceSeen);
      } else {
        var now = Date.now();
        if (recentSeen[sig] && now - recentSeen[sig] < 750) return false;
        recentSeen[sig] = now;
        trimSeen(recentSeen);
      }
      if (eventIdKey) {
        eventIdsSeen[eventIdKey] = true;
        trimSeen(eventIdsSeen);
      }

      if (TEST_MODE) TEST_EVENTS.push(JSON.parse(JSON.stringify(event)));
      send(name, event);
      return true;
    } catch (e) {
      return false;
    }
  }

  // the only place an event leaves the browser; nothing is sent while every flag is off
  function send(name, event) {
    if (!FEATURE_FLAGS.clarity || TEST_MODE || !consented('analytics') || typeof window.clarity !== 'function') return;
    try {
      window.clarity('event', name);
      var tags = ['source_page', 'damage_case', 'case_stage', 'assistant_step', 'cta_location', 'device_category'];
      for (var i = 0; i < tags.length; i++) {
        if (own(event, tags[i])) window.clarity('set', tags[i], String(event[tags[i]]));
      }
    } catch (e) {}
  }

  /* ---------- consent: two separate choices, nothing runs before a "yes" ----------
     analytics → Microsoft Clarity (usage measurement)
     ads       → Meta Pixel in the browser + the server copy of the same conversion (CAPI)
     The record: { v: version, a: 'yes'|'no', m: 'yes'|'no', t: ISO time of the choice } */
  function readRecord() {
    try {
      var v = JSON.parse(window.localStorage.getItem(CONSENT_KEY) || 'null');
      return v && v.v === CONSENT_VERSION && (v.a === 'yes' || v.a === 'no') && (v.m === 'yes' || v.m === 'no') ? v : null;
    } catch (e) { return null; }
  }
  function writeRecord(analytics, ads) {
    var rec = { v: CONSENT_VERSION, a: analytics, m: ads, t: new Date().toISOString() };
    try { window.localStorage.setItem(CONSENT_KEY, JSON.stringify(rec)); } catch (e) {}
    return rec;
  }
  function consented(purpose) {
    var r = readRecord();
    if (!r) return false;
    return purpose === 'ads' ? r.m === 'yes' : r.a === 'yes';
  }
  function bannerNeeded() {
    return (FEATURE_FLAGS.clarity || FEATURE_FLAGS.meta_pixel) && !TEST_MODE && !readRecord();
  }

  var consentListeners = [];
  function onConsentChange(fn) { if (typeof fn === 'function') consentListeners.push(fn); }

  function applyChoice(analytics, ads) {
    var before = readRecord();
    var hadAds = !!(before && before.m === 'yes');
    writeRecord(analytics, ads);
    if (analytics === 'yes') loadClarity();
    if (ads === 'yes') { loadPixel(); }
    else if (hadAds) { withdrawAds(); }
    for (var i = 0; i < consentListeners.length; i++) { try { consentListeners[i](readRecord()); } catch (e) {} }
  }

  function consentBanner() {
    if (!bannerNeeded() || document.getElementById('tv-consent')) return;
    var box = document.createElement('div');
    box.id = 'tv-consent';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'בחירות פרטיות');
    box.setAttribute('dir', 'rtl');
    box.style.cssText = 'position:fixed;inset-inline:0;bottom:0;z-index:2147483000;display:flex;justify-content:center;' +
      'padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:#1A2024;border-top:1px solid #1F8EB1;' +
      'box-shadow:0 -6px 24px rgba(0,0,0,.45);font-family:inherit;color:#ECEEEF;';
    var btn = 'min-height:44px;padding:0 18px;border-radius:22px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;';
    var row = 'display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.4;cursor:pointer;';
    var chk = 'width:20px;height:20px;margin:1px 0 0;flex:none;accent-color:#1F8EB1;';
    var html = '<div style="width:100%;max-width:520px;display:grid;gap:10px">' +
      '<p style="margin:0;font-size:14.5px;line-height:1.45">' +
      (FEATURE_FLAGS.clarity && FEATURE_FLAGS.meta_pixel
        ? 'שתי שאלות קצרות. אפשר לסרב לשתיהן, והאתר והטופס ממשיכים לעבוד כרגיל. '
        : 'שאלה קצרה. אפשר לסרב, והאתר והטופס ממשיכים לעבוד כרגיל. ') +
      '<a href="/legal/#s16" style="color:#ECEEEF;text-decoration:underline">פרטים</a></p>';
    if (FEATURE_FLAGS.clarity) {
      html += '<label style="' + row + '"><input type="checkbox" data-consent-a style="' + chk + '">' +
        '<span><strong>שיפור האתר</strong> · לראות איך משתמשים באתר (Microsoft Clarity), בלי טקסט שהקלדתם.</span></label>';
    }
    if (FEATURE_FLAGS.meta_pixel) {
      html += '<label style="' + row + '"><input type="checkbox" data-consent-m style="' + chk + '">' +
        '<span><strong>מדידת פרסום ב־Meta</strong> · לדווח ל־Meta כשפנייה נשלחת, כדי למדוד אילו מודעות עובדות. כולל עוגיות של Meta, ופרטי קשר מוצפנים אם תשאירו פנייה.</span></label>';
    }
    html += '<div style="display:flex;gap:10px">' +
      '<button type="button" data-consent="save" style="' + btn + 'flex:1;border:0;background:#1F8EB1;color:#080A0C">שמירת הבחירה</button>' +
      '<button type="button" data-consent="no" style="' + btn + 'flex:1;border:1px solid #A7AFB5;background:none;color:#ECEEEF">לא תודה</button>' +
      '</div></div>';
    box.innerHTML = html;
    box.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-consent]');
      if (!b) return;
      var a = box.querySelector('[data-consent-a]');
      var m = box.querySelector('[data-consent-m]');
      var save = b.getAttribute('data-consent') === 'save';
      applyChoice(save && a && a.checked ? 'yes' : 'no', save && m && m.checked ? 'yes' : 'no');
      box.parentNode.removeChild(box);
    });
    document.body.appendChild(box);
  }
  function bindConsentReset() {
    var nodes = document.querySelectorAll('[data-consent-reset]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].addEventListener('click', function () {
        var had = readRecord();
        try { window.localStorage.removeItem(CONSENT_KEY); } catch (e) {}
        // until a new choice is saved nothing new is sent; a previous "yes" to ads is treated as withdrawn
        if (had && had.m === 'yes') withdrawAds();
        consentBanner();
      });
    }
  }

  function loadClarity() {
    if (!FEATURE_FLAGS.clarity || TEST_MODE || !consented('analytics') || typeof window.clarity === 'function') return;
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_PROJECT_ID);
  }

  /* ---------- Meta Pixel: only with advertising consent ----------
     - automatic events (button text, page metadata) are switched off;
     - the page address sent to Meta carries no case details: case/state and any other
       non-campaign parameter is removed from the address bar before the Pixel starts
       (the section anchor after # is kept; it names a page section, not a person or case);
     - the only conversion sent is Lead, after the server confirmed the save, with the
       server's event id, so the browser and server copies are counted once. */
  var pixelStarted = false;
  var CAMPAIGN_PARAMS = /^(utm_(source|medium|campaign|content|term)|fbclid)$/;

  function cleanAddressForPixel() {
    try {
      if (!window.history || typeof window.history.replaceState !== 'function') return;
      var url = new URL(window.location.href);
      var keep = new URLSearchParams();
      var changed = false;
      url.searchParams.forEach(function (v, k) { if (CAMPAIGN_PARAMS.test(k)) keep.append(k, v); else changed = true; });
      if (!changed) return;
      var q = keep.toString();
      window.history.replaceState(window.history.state, '', url.pathname + (q ? '?' + q : '') + url.hash);
    } catch (e) {}
  }

  function loadPixel() {
    if (!FEATURE_FLAGS.meta_pixel || TEST_MODE || !consented('ads')) return;
    if (pixelStarted) { try { window.fbq('consent', 'grant'); } catch (e) {} return; }
    pixelStarted = true;
    var start = function () {
      cleanAddressForPixel();
      /* eslint-disable */
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      window.fbq('consent', 'grant');
      window.fbq('set', 'autoConfig', false, META_PIXEL_ID);
      window.fbq('init', META_PIXEL_ID);
      window.fbq('track', 'PageView');
    };
    // page scripts read their own parameters first; the address is cleaned after that
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  function expireCookie(name) {
    var host = window.location.hostname;
    var parts = host.split('.');
    var domains = ['', host];
    if (parts.length >= 2) domains.push('.' + parts.slice(-2).join('.'));
    if (parts.length >= 3) domains.push('.' + parts.slice(-3).join('.'));
    for (var i = 0; i < domains.length; i++) {
      document.cookie = name + '=; Max-Age=0; path=/' + (domains[i] ? '; domain=' + domains[i] : '');
    }
  }

  function readAdLeads() {
    try {
      var list = JSON.parse(window.localStorage.getItem(AD_LEADS_KEY) || '[]');
      var cutoff = Date.now() - AD_LEADS_MAX_DAYS * 864e5;
      return Array.isArray(list) ? list.filter(function (x) { return x && typeof x.id === 'string' && x.t > cutoff; }) : [];
    } catch (e) { return []; }
  }
  function rememberAdLead(leadId) {
    if (typeof leadId !== 'string' || !/^LD-[0-9a-f]{64}$/.test(leadId)) return;
    var list = readAdLeads().filter(function (x) { return x.id !== leadId; });
    list.push({ id: leadId, t: Date.now() });
    try { window.localStorage.setItem(AD_LEADS_KEY, JSON.stringify(list.slice(-20))); } catch (e) {}
  }

  // withdrawal: stop the Pixel, remove Meta's cookies, and tell the server so queued and
  // later reports about leads from this browser are not sent
  function withdrawAds() {
    try { if (typeof window.fbq === 'function') window.fbq('consent', 'revoke'); } catch (e) {}
    expireCookie('_fbp');
    expireCookie('_fbc');
    var leads = readAdLeads();
    if (!leads.length) return;
    var cfg = window.INTAKE_CONFIG || {};
    if (!cfg.endpointUrl || typeof fetch !== 'function') return;
    try {
      fetch(cfg.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        keepalive: true,
        body: JSON.stringify({
          op: 'consent', client_marker: cfg.clientMarker || '',
          lead_ids: leads.map(function (x) { return x.id; }),
          ad_consent: 'withdrawn', consent_version: CONSENT_VERSION
        })
      }).then(function (r) { return r.json(); }).then(function (json) {
        if (json && json.ok === true) { try { window.localStorage.removeItem(AD_LEADS_KEY); } catch (e) {} }
      }).catch(function () {});
    } catch (e) {}
  }

  function readCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  // fields that go with a lead only when the visitor agreed to advertising measurement
  function adLeadFields() {
    var rec = readRecord();
    if (!FEATURE_FLAGS.meta_pixel || !rec || rec.m !== 'yes') {
      return { ad_consent: rec ? 'denied' : 'unset', ad_consent_version: rec ? CONSENT_VERSION : '' };
    }
    var fbp = readCookie('_fbp');
    var fbc = readCookie('_fbc');
    if (!fbc && window.ATTRIBUTION && typeof window.ATTRIBUTION.fbc === 'function') fbc = window.ATTRIBUTION.fbc();
    return {
      ad_consent: 'granted',
      ad_consent_version: CONSENT_VERSION,
      ad_consent_at: rec.t || '',
      fbp: /^fb\.[0-9]\.[0-9]{10,13}\.[0-9]{1,30}$/.test(fbp) ? fbp : '',
      fbc: /^fb\.[0-9]\.[0-9]{10,13}\.[A-Za-z0-9_\-]{10,500}(\.[A-Za-z0-9_\-]{1,40})?$/.test(fbc) ? fbc : '',
      client_user_agent: String(navigator.userAgent || '').slice(0, 512),
      event_source_url: window.location.origin + window.location.pathname
    };
  }

  // the browser copy of a saved lead. eventId comes from the server's save acknowledgement.
  function trackLead(eventId, leadId) {
    if (!FEATURE_FLAGS.meta_pixel || TEST_MODE || !consented('ads')) return false;
    if (typeof eventId !== 'string' || !/^ev_[0-9a-f]{32}$/.test(eventId)) return false;
    rememberAdLead(leadId);
    loadPixel();
    try { window.fbq('track', 'Lead', {}, { eventID: eventId }); return true; } catch (e) { return false; }
  }

  function normalizeCtaLocation(value) {
    if (value === 'sticky') return 'sticky_mobile';
    return enumValue('cta_location', value);
  }

  function ctaLocationFor(element) {
    var direct = normalizeCtaLocation(element.getAttribute('data-cta-location') || '');
    if (direct) return direct;
    if (element.hasAttribute('data-continue-whatsapp')) return 'success';
    var ui = element.getAttribute('data-ui-location') || '';
    if (ui === 'escape') return 'sticky_mobile';
    if (ui === 'faq') return 'faq';
    if (ui === 'header') return 'header';
    return currentPage() === 'check' ? 'sticky_mobile' : 'header';
  }

  function ctaIdFor(element, location) {
    var id = element.getAttribute('data-measure-cta') || '';
    return SLUG.test(id) ? id : '';
  }

  function observeOnce(nodes, callback) {
    if (!('IntersectionObserver' in window)) return;
    var timers = [];
    var observer = new window.IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        (function (entry) {
          var node = entry.target;
          var index = nodes.indexOf(node);
          if (index === -1) return;
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) {
            if (timers[index]) window.clearTimeout(timers[index]);
            timers[index] = null;
            return;
          }
          if (!timers[index]) {
            timers[index] = window.setTimeout(function () {
              callback(node);
              observer.unobserve(node);
              timers[index] = null;
            }, 1000);
          }
        })(entries[i]);
      }
    }, { threshold: [0.5] });
    for (var j = 0; j < nodes.length; j++) observer.observe(nodes[j]);
  }

  function bindMarketingEvents() {
    var page = currentPage();
    if (page !== 'home' && page !== 'damage') return;

    var faqs = Array.prototype.slice.call(document.querySelectorAll('[data-faq-item]'));
    for (var i = 0; i < faqs.length; i++) {
      faqs[i].addEventListener('toggle', function (event) {
        var item = event.currentTarget;
        if (!item.open) return;
        trackEvent('faq_open', { faq_id: item.getAttribute('data-faq-id') || '' });
      });
    }

    var ctas = Array.prototype.slice.call(document.querySelectorAll('[data-cta-location]:not([data-wa-link])'));
    for (var c = 0; c < ctas.length; c++) {
      ctas[c].addEventListener('click', function (event) {
        var element = event.currentTarget;
        var location = ctaLocationFor(element);
        trackEvent('cta_click', {
          cta_location: location,
          cta_id: ctaIdFor(element, location),
          service_interest: element.getAttribute('data-service-interest') || ''
        });
      });
    }
    observeOnce(ctas, function (element) {
      var location = ctaLocationFor(element);
      trackEvent('cta_view', {
        cta_location: location,
        cta_id: ctaIdFor(element, location),
        service_interest: element.getAttribute('data-service-interest') || ''
      });
    });

    var sections = Array.prototype.slice.call(document.querySelectorAll('[data-measure-section]'));
    observeOnce(sections, function (section) {
      trackEvent('section_view', { section_id: section.getAttribute('data-measure-section') || '' });
    });

    var milestones = [25, 50, 75, 90];
    var onScroll = function () {
      var root = document.documentElement;
      var body = document.body;
      var height = Math.max(root.scrollHeight, body ? body.scrollHeight : 0) - window.innerHeight;
      if (height <= 0) return;
      var percent = Math.floor((window.pageYOffset || root.scrollTop || 0) * 100 / height);
      for (var m = 0; m < milestones.length; m++) {
        if (percent >= milestones[m]) trackEvent('scroll_depth', { depth_percent: String(milestones[m]) });
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function bindContactEvents() {
    var links = Array.prototype.slice.call(document.querySelectorAll('[data-wa-link]'));
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function (event) {
        var element = event.currentTarget;
        trackEvent('whatsapp_click', {
          cta_location: ctaLocationFor(element),
          handoff_mode: element.hasAttribute('data-fallback-whatsapp') ? 'fallback' : 'generic_whatsapp'
        });
      });
    }
  }

  window.TAVIV_CONSENT = {
    version: CONSENT_VERSION,
    analytics: function () { return consented('analytics'); },
    ads: function () { return consented('ads'); },
    record: readRecord,
    onChange: onConsentChange,
    adLeadFields: adLeadFields,
    trackLead: trackLead,
    pixelEnabled: function () { return FEATURE_FLAGS.meta_pixel; }
  };

  window.TAVIV_MEASUREMENT = {
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    featureFlags: FEATURE_FLAGS,
    trackEvent: trackEvent,
    createEventId: createEventId,
    sourcePage: currentPage
  };

  if (TEST_MODE) {
    window.TAVIV_MEASUREMENT.test = {
      events: TEST_EVENTS,
      reset: function () {
        TEST_EVENTS.length = 0;
        onceSeen = {};
        recentSeen = {};
        eventIdsSeen = {};
      }
    };
  }

  loadClarity();
  loadPixel();
  if (document.body) { consentBanner(); bindConsentReset(); }
  else { document.addEventListener('DOMContentLoaded', function () { consentBanner(); bindConsentReset(); }); }
  var page = currentPage();
  if (page === 'home' || page === 'damage' || page === 'check' || page === 'assistant' || page === 'not_found') {
    trackEvent('page_view', {});
  }
  bindMarketingEvents();
  bindContactEvents();
})();
