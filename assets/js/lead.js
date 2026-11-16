/*
 * One submission contract for every website entry point (/check/ and /assistant/).
 *
 * The lead counts as saved ONLY when the backend answers ok:true for the same lead_id.
 * Backend answers (Apps Script, response contract 2026-11-16):
 *   saved          { ok:true,  status:'saved',         duplicate:false, lead_id, event_id, saved_at }
 *   already saved  { ok:true,  status:'already_saved', duplicate:true,  lead_id, event_id }
 *   rejected       { ok:false, status:'rejected', code }        – do not retry as is
 *   failed         { ok:false, status:'failed',   code }        – safe to retry, same lead_id
 * The older backend (code 2026-09-13.1) answers { ok, duplicate, lead_id } without status or
 * event_id; that is still read as saved / already saved, just without a Meta event id.
 *
 * Retries always resend the SAME body (same lead_id), so the backend stores one row at most.
 * The Meta "Lead" event in the browser fires only after a confirmed save, with the event id
 * the server generated, so the browser and server copies are deduplicated by Meta.
 */
window.TAVIV_LEAD = (function () {
  'use strict';

  var TIMEOUT_MS = 15000;
  var RETRY_DELAY_MS = 2000;
  var EVENT_ID = /^ev_[0-9a-f]{32}$/;
  var FIRED_KEY = 'tv_lead_fired';
  var TEST_SOURCES = ['smoke_test', 'test', 'qa'];
  var RETRYABLE = ['server_busy', 'server_error', 'rate_limited', 'network', 'timeout', 'http_error', 'bad_response'];

  function cfg() { return window.INTAKE_CONFIG || {}; }

  function interpret(json, leadId) {
    if (!json || typeof json !== 'object') return { state: 'failed', code: 'bad_response', retryable: true };
    if (json.ok === true) {
      if (json.lead_id !== leadId) return { state: 'failed', code: 'lead_mismatch', retryable: false };
      var hasStatus = json.status === 'saved' || json.status === 'already_saved';
      if (!hasStatus && typeof json.duplicate !== 'boolean') {
        return { state: 'failed', code: 'bad_response', retryable: true };
      }
      var dup = hasStatus ? json.status === 'already_saved' : json.duplicate === true;
      return {
        state: dup ? 'already_saved' : 'saved',
        eventId: typeof json.event_id === 'string' && EVENT_ID.test(json.event_id) ? json.event_id : ''
      };
    }
    var code = typeof json.code === 'string' && /^[a-z_]{1,40}$/.test(json.code) ? json.code : 'unknown';
    var retry = json.status === 'failed' || RETRYABLE.indexOf(code) !== -1;
    return { state: retry ? 'failed' : 'rejected', code: code, retryable: retry };
  }

  function postOnce(body) {
    var url = cfg().endpointUrl;
    if (!url || typeof fetch !== 'function' || typeof AbortController !== 'function') {
      return Promise.resolve({ state: 'failed', code: 'transport_unavailable', retryable: false });
    }
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // simple request: Apps Script has no preflight
      body: JSON.stringify(body),
      signal: controller.signal
    }).then(function (response) {
      window.clearTimeout(timer);
      if (!response.ok) return { state: 'failed', code: 'http_error', retryable: true };
      return response.json().then(function (json) { return interpret(json, body.lead_id); },
        function () { return { state: 'failed', code: 'bad_response', retryable: true }; });
    }, function (error) {
      window.clearTimeout(timer);
      var timeout = error && error.name === 'AbortError';
      return { state: 'failed', code: timeout ? 'timeout' : 'network', retryable: true };
    });
  }

  // one automatic retry for transient failures, with the same body. Never rejects.
  function submit(body) {
    return postOnce(body).then(function (first) {
      if (first.state !== 'failed' || !first.retryable) return first;
      return new Promise(function (resolve) {
        window.setTimeout(function () { postOnce(body).then(resolve); }, RETRY_DELAY_MS);
      });
    });
  }

  function firedSet() {
    try { return JSON.parse(window.sessionStorage.getItem(FIRED_KEY) || '[]'); } catch (e) { return []; }
  }

  // after a confirmed save: the browser copy of the conversion, once per event id
  function afterSave(result, leadId) {
    if (!result || (result.state !== 'saved' && result.state !== 'already_saved')) return false;
    if (!result.eventId) return false;
    var fired = firedSet();
    if (fired.indexOf(result.eventId) !== -1) return false;
    var C = window.TAVIV_CONSENT;
    if (!C || typeof C.trackLead !== 'function' || !C.trackLead(result.eventId, leadId)) return false;
    fired.push(result.eventId);
    try { window.sessionStorage.setItem(FIRED_KEY, JSON.stringify(fired.slice(-20))); } catch (e) {}
    return true;
  }

  // advertising fields travel with the lead only when the visitor agreed to them
  function adFields() {
    var C = window.TAVIV_CONSENT;
    if (C && typeof C.adLeadFields === 'function') return C.adLeadFields();
    return { ad_consent: 'unset', ad_consent_version: '' };
  }

  // a test inquiry is labelled so it never reaches follow-up, reports or Meta's live data
  function isTest() {
    try {
      if (/(^|[?&])tv_test=1(&|$)/.test(window.location.search)) window.sessionStorage.setItem('tv_test', '1');
      if (window.sessionStorage.getItem('tv_test') === '1') return true;
    } catch (e) {}
    var A = window.ATTRIBUTION;
    var src = A && typeof A.get === 'function' ? String(A.get().utm_source || '').toLowerCase() : '';
    return TEST_SOURCES.indexOf(src) !== -1;
  }

  function browserContext() {
    var ua = navigator.userAgent || '';
    if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|musical_ly|Snapchat/i.test(ua)) return 'in_app_browser';
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || coarse ? 'mobile_browser' : 'desktop_browser';
  }

  // with the fields the measurement layer needs; the copy for Taviv App leaves them out
  function withMeasurement(payload) {
    var out = {};
    var k;
    for (k in payload) { if (Object.prototype.hasOwnProperty.call(payload, k)) out[k] = payload[k]; }
    var ads = adFields();
    for (k in ads) { if (Object.prototype.hasOwnProperty.call(ads, k)) out[k] = ads[k]; }
    out.is_test = isTest() ? '1' : '';
    return out;
  }

  var MEASUREMENT_FIELDS = ['ad_consent', 'ad_consent_version', 'ad_consent_at', 'fbp', 'fbc',
    'client_user_agent', 'event_source_url', 'is_test', 'entry_point'];
  function withoutMeasurement(payload) {
    var out = {};
    for (var k in payload) {
      if (Object.prototype.hasOwnProperty.call(payload, k) && MEASUREMENT_FIELDS.indexOf(k) === -1) out[k] = payload[k];
    }
    return out;
  }

  // the measurement enum for an error shown to the visitor
  function errorCode(result) {
    if (!result) return 'unknown_safe';
    if (result.code === 'timeout') return 'network_timeout';
    if (result.code === 'network' || result.code === 'transport_unavailable') return 'network_error';
    if (result.code === 'rate_limited') return 'rate_limited';
    if (result.state === 'rejected') return 'server_rejected';
    return 'unknown_safe';
  }

  return {
    interpret: interpret,
    submit: submit,
    afterSave: afterSave,
    withMeasurement: withMeasurement,
    withoutMeasurement: withoutMeasurement,
    browserContext: browserContext,
    errorCode: errorCode,
    isTest: isTest
  };
})();
