(function () {
  'use strict';

  var KEY = 'attribution_v1';
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var CAMPAIGN_KEYS = UTM_KEYS.concat(['fbclid']);
  var MAX_VALUE = 200;
  var MAX_REFERRER = 300;
  var MAX_SOURCE_PAGE = 256;
  var MAX_FBCLID = 512;

  function codePointLength(value) {
    return typeof value === 'string' ? Array.from(value).length : 0;
  }

  function cleanFbclid(value) {
    if (typeof value !== 'string') return '';
    var v = value.trim();
    if (!v || codePointLength(v) > MAX_FBCLID) return '';
    if (/\s/.test(v)) return '';
    if (/[\u0000-\u001F\u007F-\u009F]/.test(v)) return '';
    return v;
  }

  function cleanSourcePage(value) {
    if (typeof value !== 'string') return '';
    var v = value.trim();
    if (!v || v.charAt(0) !== '/' || v.charAt(1) === '/') return '';
    if (codePointLength(v) > MAX_SOURCE_PAGE) return '';
    if (v.indexOf('?') !== -1 || v.indexOf('#') !== -1) return '';
    if (/[\u0000-\u001F\u007F]/.test(v)) return '';
    return /^[A-Za-z0-9\/._~%-]+$/.test(v) ? v : '';
  }

  function load() {
    try {
      var raw = sessionStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function save(record) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(record));
    } catch (e) {
    }
  }

  function clean(value, max) {
    if (typeof value !== 'string') return '';
    var trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.slice(0, max);
  }

  function capture() {
    var record = load() || {};

    var params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (e) {
      params = null;
    }

    var sawCampaign = false;
    if (params) {
      for (var i = 0; i < CAMPAIGN_KEYS.length; i++) {
        var key = CAMPAIGN_KEYS[i];
        if (record[key]) continue;               // first touch already held
        var value = key === 'fbclid'
          ? cleanFbclid(params.get(key))
          : clean(params.get(key), MAX_VALUE);
        if (value) {
          record[key] = value;
          sawCampaign = true;
        }
      }
    }

    if (!record.landing_route) {
      record.landing_route = window.location.pathname || '/';
    }

    if (!record.referrer) {
      var ref = clean(document.referrer, MAX_REFERRER);
      if (ref && ref.indexOf(window.location.origin) !== 0) {
        record.referrer = ref;
      }
    }

    if (sawCampaign || Object.keys(record).length) {
      save(record);
    }
    return record;
  }

  function derivedSource(record) {
    var raw = (record && record.utm_source ? record.utm_source : '').toLowerCase();
    if (!raw) return '';
    if (/facebook|^fb$|instagram|^ig$|meta/.test(raw)) return 'facebook';
    if (/google|adwords|gads/.test(raw)) return 'google';
    if (/whatsapp|^wa$/.test(raw)) return 'whatsapp';
    return 'other';
  }

  var CTA_LOCATIONS = ['hero', 'mid', 'closing', 'sticky', 'pricing'];

  var SERVICE_INTERESTS = ['appraisal_only', 'appraisal_managed', 'remote_feasibility', 'insurer_gap'];

  var SERVICE_EVENTS = ['service_details_open', 'service_price_reveal', 'service_cta_click'];

  function recordServiceEvent(eventName, serviceId) {
    if (SERVICE_EVENTS.indexOf(eventName) === -1) return;
    if (SERVICE_INTERESTS.indexOf(serviceId) === -1) return;
    var record = load() || {};
    var log = typeof record.service_log === 'string' && record.service_log
      ? record.service_log.split(',')
      : [];
    if (log.length < 40) {
      log.push(eventName.replace('service_', '') + ':' + serviceId);
      record.service_log = log.join(',');
    }
    if (eventName === 'service_price_reveal') {
      var revealed = typeof record.service_price_revealed === 'string' && record.service_price_revealed
        ? record.service_price_revealed.split(',')
        : [];
      if (revealed.indexOf(serviceId) === -1 && revealed.length < 8) {
        revealed.push(serviceId);
        record.service_price_revealed = revealed.join(',');
      }
    }
    save(record);
  }

  function recordCtaLocation(value, serviceInterest) {
    if (CTA_LOCATIONS.indexOf(value) === -1) return;
    var record = load() || {};
    record.cta_location = value;
    if (serviceInterest && SERVICE_INTERESTS.indexOf(serviceInterest) !== -1) {
      record.service_interest = serviceInterest;
    } else {
      delete record.service_interest;
    }
    var sourcePage = cleanSourcePage(window.location.pathname || '/');
    if (sourcePage) {
      record.source_page = sourcePage;
    } else {
      delete record.source_page;   // absent beats wrong
    }
    save(record);
  }

  function bindCtaLinks() {
    var nodes = document.querySelectorAll('[data-cta-location]');
    Array.prototype.forEach.call(nodes, function (el) {
      el.addEventListener('click', function () {
        recordCtaLocation(el.getAttribute('data-cta-location'), el.getAttribute('data-service-interest'));
      });
    });
  }

  var record = capture();
  bindCtaLinks();

  window.ATTRIBUTION = {
    get: function () { return load() || {}; },
    source: function () { return derivedSource(load() || record); },
    ctaLocation: function () {
      var r = load() || {};
      return CTA_LOCATIONS.indexOf(r.cta_location) === -1 ? '' : r.cta_location;
    },
    serviceInterest: function () {
      var r = load() || {};
      return SERVICE_INTERESTS.indexOf(r.service_interest) === -1 ? '' : r.service_interest;
    },
    servicePriceRevealed: function () {
      var r = load() || {};
      var interest = SERVICE_INTERESTS.indexOf(r.service_interest) === -1 ? '' : r.service_interest;
      if (!interest) return '';
      var revealed = (r.service_price_revealed || '').split(',');
      return revealed.indexOf(interest) === -1 ? 'false' : 'true';
    },
    serviceLog: function () {
      var r = load() || {};
      return typeof r.service_log === 'string' ? r.service_log : '';
    },
    recordServiceEvent: recordServiceEvent,
    recordCtaLocation: recordCtaLocation
  };
})();
