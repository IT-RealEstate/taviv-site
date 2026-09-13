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

  var FEATURE_FLAGS = {
    ga4: false,
    clarity: false,
    google_ads: false
  };
  if (Object.freeze) Object.freeze(FEATURE_FLAGS);

  var ROUTES = {
    '/': 'home',
    '/damage/': 'damage',
    '/check/': 'check',
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
    source_page: ['home', 'damage', 'check', 'legal', 'not_found'],
    landing_path: ['home', 'damage', 'check'],
    cta_location: ['header', 'hero', 'mid', 'pricing', 'faq', 'closing', 'sticky_mobile', 'success'],
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
    'service_interest', 'duplicate'
  ];

  var EVENTS = {
    page_view: spec(['source_page', 'content_version', 'device_category', 'viewport_bucket'], [], ['home', 'damage', 'check', 'not_found'], true, ['source_page']),
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
    whatsapp_click: spec(['source_page', 'cta_location', 'event_id'], ['handoff_mode'], ['home', 'damage', 'check'], false, ['source_page', 'cta_location', 'handoff_mode']),
    intake_view: spec(['source_page'], ['first_touch_source'], ['check'], true, ['source_page']),
    intake_start: spec(['source_page', 'intake_step_id', 'event_id'], ['device_category', 'viewport_bucket'], ['check'], true, ['source_page']),
    intake_step_view: spec(['intake_step_id'], ['source_page'], ['check'], true, ['intake_step_id']),
    intake_step_complete: spec(['intake_step_id'], ['source_page'], ['check'], true, ['intake_step_id']),
    intake_validation_error: spec(['intake_step_id', 'field_id', 'error_code'], ['source_page', 'device_category'], ['check'], false, ['intake_step_id', 'field_id', 'error_code']),
    intake_submit_attempt: spec(['event_id', 'source_page'], ['intake_step_id'], ['check'], false, ['event_id']),
    intake_submit_success: spec(['event_id', 'source_page'], ['duplicate'], ['check'], true, ['event_id']),
    intake_submit_error: spec(['event_id', 'error_code'], ['source_page', 'intake_step_id'], ['check'], false, ['event_id', 'error_code'])
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
      return true;
    } catch (e) {
      return false;
    }
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

  var page = currentPage();
  if (page === 'home' || page === 'damage' || page === 'check' || page === 'not_found') {
    trackEvent('page_view', {});
  }
  bindMarketingEvents();
  bindContactEvents();
})();
