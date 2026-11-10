/*
 * Parallel hand-off of website leads to Taviv App (app.taviv.co.il).
 *
 * Contract: taviv-app docs/spec/WEBSITE_TO_APP_HANDOFF_CONTRACT_v2.md
 *   - create:     POST {appLeadsUrl}            application/json + Idempotency-Key (UUID)
 *                 -> { ok:true, destination, enrichment_token }
 *   - enrichment: POST {appEnrichmentUrl}       Lead-Enrichment + new Idempotency-Key per attempt
 *   - web continuation uses `destination` AS RECEIVED (the site never builds /start?h= itself).
 *
 * This runs NEXT TO the existing Apps Script save, never instead of it. Every failure here
 * is silent: the visitor keeps the current WhatsApp continuation. Nothing from this module
 * decides whether the lead was saved.
 *
 * Privacy: no PII in URLs. Raw `h` (inside destination) and the enrichment token are kept in
 * memory only. sessionStorage holds only the create Idempotency-Key per legacy lead ref, so
 * a reload re-sends the SAME key (server replay) instead of creating a second lead.
 */
window.TAVIV_APP_HANDOFF = (function () {
  var TIMEOUT_MS = 8000;
  var DESTINATION_TTL_MS = 14 * 60 * 1000; // server token lives 15 min; stop offering it a bit earlier
  var KEY_PREFIX = 'taviv_app_create_key:';
  var ENRICH_FIELDS = ['client_marker', 'lead_id', 'full_name', 'phone_raw', 'email',
    'damage_type', 'case_state', 'property_city', 'short_description'];

  // The site's LD-<64 hex> id is sent so the app can store it and the CRM can match the
  // website row (taviv-app#334 widens the app schema). Until #334 is live, set
  // appLongLeadRef: 'off' in intake-config.js and only the short legacy ref is sent.
  var SHORT_LEAD_REF = /^LD-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;
  var LONG_LEAD_REF = /^LD-[0-9a-f]{64}$/;
  function appAcceptsRef(v) {
    v = String(v);
    return SHORT_LEAD_REF.test(v) || (cfg().appLongLeadRef !== 'off' && LONG_LEAD_REF.test(v));
  }

  function withAppLeadRef(payload) {
    var out = {};
    for (var k in payload) {
      if (!Object.prototype.hasOwnProperty.call(payload, k)) continue;
      if (k === 'lead_id' && !appAcceptsRef(payload[k])) continue;
      out[k] = payload[k];
    }
    return out;
  }

  var created = null;            // { destination, enrichmentToken, receivedAt }
  var createPromise = null;
  var listeners = [];

  function cfg() { return window.INTAKE_CONFIG || {}; }

  function enabled() {
    var c = cfg();
    return c.appHandoff === 'on' && c.mode === 'live' &&
      typeof c.appLeadsUrl === 'string' && c.appLeadsUrl.indexOf('https://') === 0 &&
      typeof fetch === 'function' && typeof AbortController === 'function';
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = '';
    for (var i = 0; i < 16; i++) h += ('0' + b[i].toString(16)).slice(-2);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function createKeyFor(leadRef) {
    var storageKey = KEY_PREFIX + (leadRef || 'none');
    try {
      var existing = sessionStorage.getItem(storageKey);
      if (existing) return existing;
      var fresh = uuid();
      sessionStorage.setItem(storageKey, fresh);
      return fresh;
    } catch (e) {
      return uuid();
    }
  }

  function postJson(url, body, headers) {
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    var h = { 'Content-Type': 'application/json' };
    for (var k in headers) { if (Object.prototype.hasOwnProperty.call(headers, k)) h[k] = headers[k]; }
    return fetch(url, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: h,
      body: JSON.stringify(body),
      signal: controller.signal
    }).then(function (response) {
      window.clearTimeout(timer);
      if (!response.ok) throw new Error('http_' + response.status);
      return response.json();
    }, function (error) {
      window.clearTimeout(timer);
      throw error;
    });
  }

  // Accept only https://<appOrigin>/start?h=<opaque> with no other query or fragment.
  function safeDestination(value) {
    if (typeof value !== 'string') return null;
    var origin = cfg().appOrigin;
    var url;
    try { url = new URL(value); } catch (e) { return null; }
    if (url.origin !== origin || url.pathname !== '/start' || url.hash) return null;
    var keys = [];
    url.searchParams.forEach(function (_v, k) { keys.push(k); });
    if (keys.length !== 1 || keys[0] !== 'h' || !url.searchParams.get('h')) return null;
    return url.toString();
  }

  function notify() {
    var url = destination();
    if (!url) return;
    var pending = listeners;
    listeners = [];
    pending.forEach(function (fn) { try { fn(url); } catch (e) {} });
  }

  // Fire-and-forget create. Resolves to true/false; never rejects.
  function create(payload) {
    if (!enabled() || !payload) return Promise.resolve(false);
    if (createPromise) return createPromise;
    var key = createKeyFor(payload.lead_id);
    createPromise = postJson(cfg().appLeadsUrl, withAppLeadRef(payload), { 'Idempotency-Key': key })
      .then(function (json) {
        var dest = json && json.ok === true ? safeDestination(json.destination) : null;
        if (!dest) return false;
        created = {
          destination: dest,
          enrichmentToken: typeof json.enrichment_token === 'string' ? json.enrichment_token : '',
          receivedAt: Date.now()
        };
        notify();
        return true;
      })
      .catch(function () { return false; })
      .then(function (ok) {
        // Allow a later retry (same Idempotency-Key from sessionStorage) after a failure.
        if (!ok) createPromise = null;
        return ok;
      });
    var current = createPromise;
    return current;
  }

  // Fire-and-forget enrichment of late answers. Waits for create; never rejects.
  function enrich(payload) {
    if (!enabled() || !createPromise || !payload) return Promise.resolve(false);
    return createPromise.then(function (ok) {
      var c = cfg();
      if (!ok || !created || !created.enrichmentToken || !c.appEnrichmentUrl) return false;
      var body = { client_marker: c.clientMarker || '' };
      var updatable = 0;
      ENRICH_FIELDS.forEach(function (name) {
        if (name === 'client_marker') return;
        var v = payload[name];
        if (typeof v !== 'string' || v === '') return;
        if (name === 'lead_id' && !appAcceptsRef(v)) return;
        body[name] = v;
        if (name !== 'lead_id') updatable += 1;
      });
      if (!updatable) return false;
      return postJson(c.appEnrichmentUrl, body, {
        'Lead-Enrichment': created.enrichmentToken,
        'Idempotency-Key': uuid()
      }).then(function (json) { return !!(json && json.ok === true); });
    }).catch(function () { return false; });
  }

  function destination() {
    if (!created) return null;
    if (Date.now() - created.receivedAt > DESTINATION_TTL_MS) return null;
    return created.destination;
  }

  // Calls fn(url) once a usable destination exists (immediately if it already does).
  function onDestination(fn) {
    if (destination()) { fn(destination()); return; }
    listeners.push(fn);
  }

  return {
    enabled: enabled,
    create: create,
    enrich: enrich,
    destination: destination,
    onDestination: onDestination,
    _safeDestination: safeDestination,
    _withAppLeadRef: withAppLeadRef
  };
})();
