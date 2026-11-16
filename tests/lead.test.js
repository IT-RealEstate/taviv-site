// Run: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'lead.js'), 'utf8');
const LEAD = 'LD-' + 'a'.repeat(64);
const EV = 'ev_' + '1'.repeat(32);

function load({ responses = [], consent = null, search = '', utm = '' } = {}) {
  const calls = [];
  const session = new Map();
  const window = {
    INTAKE_CONFIG: { endpointUrl: 'https://script.google.com/macros/s/X/exec', clientMarker: 'taviv-web-1' },
    location: { search },
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout,
    sessionStorage: { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)) },
    ATTRIBUTION: { get: () => ({ utm_source: utm }) },
    TAVIV_CONSENT: consent,
    matchMedia: () => ({ matches: false })
  };
  const ctx = {
    window, AbortController, navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' },
    fetch: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
      const next = responses.shift();
      if (!next) throw new Error('network');
      if (next instanceof Error) throw next;
      return { ok: (next.status || 200) < 300, status: next.status || 200, json: async () => next.json };
    }
  };
  vm.runInNewContext(SRC, ctx);
  return { L: window.TAVIV_LEAD, calls, session, window };
}

test('new contract: saved with event id', () => {
  const { L } = load();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(L.interpret({ ok: true, status: 'saved', duplicate: false, lead_id: LEAD, event_id: EV }, LEAD))),
    { state: 'saved', eventId: EV });
});

test('new contract: already saved keeps the same event id', () => {
  const { L } = load();
  assert.strictEqual(L.interpret({ ok: true, status: 'already_saved', duplicate: true, lead_id: LEAD, event_id: EV }, LEAD).state, 'already_saved');
});

test('old backend answer is still a save, without a Meta event id', () => {
  const { L } = load();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(L.interpret({ ok: true, duplicate: false, lead_id: LEAD }, LEAD))), { state: 'saved', eventId: '' });
});

test('ok:true for another lead id is NOT a save', () => {
  const { L } = load();
  assert.strictEqual(L.interpret({ ok: true, duplicate: false, lead_id: 'LD-' + 'b'.repeat(64) }, LEAD).state, 'failed');
});

test('ok:true without status or duplicate flag is NOT a save', () => {
  const { L } = load();
  assert.strictEqual(L.interpret({ ok: true, lead_id: LEAD }, LEAD).state, 'failed');
});

test('validation failure is rejected and not retried', async () => {
  const { L, calls } = load({ responses: [{ json: { ok: false, code: 'validation_failed' } }] });
  const r = await L.submit({ lead_id: LEAD });
  assert.strictEqual(r.state, 'rejected');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(L.errorCode(r), 'server_rejected');
});

test('transient failure is retried once with the same body', async () => {
  const { L, calls } = load({ responses: [new Error('network'), { json: { ok: true, status: 'saved', duplicate: false, lead_id: LEAD, event_id: EV } }] });
  const r = await L.submit({ lead_id: LEAD, full_name: 'x' });
  assert.strictEqual(r.state, 'saved');
  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(calls[0].body, calls[1].body);
  assert.strictEqual(calls[0].headers['Content-Type'], 'text/plain;charset=utf-8');
});

test('two transient failures end as failed (retry offered to the visitor)', async () => {
  const { L, calls } = load({ responses: [{ json: { ok: false, status: 'failed', code: 'server_busy' } }, new Error('network')] });
  const r = await L.submit({ lead_id: LEAD });
  assert.strictEqual(r.state, 'failed');
  assert.strictEqual(calls.length, 2);
});

test('browser Lead fires once per event id, and only after a save', () => {
  const fired = [];
  const consent = { trackLead: (ev, lead) => { fired.push([ev, lead]); return true; } };
  const { L } = load({ consent });
  assert.strictEqual(L.afterSave({ state: 'rejected' }, LEAD), false);
  assert.strictEqual(L.afterSave({ state: 'saved', eventId: '' }, LEAD), false);
  assert.strictEqual(L.afterSave({ state: 'saved', eventId: EV }, LEAD), true);
  assert.strictEqual(L.afterSave({ state: 'already_saved', eventId: EV }, LEAD), false);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(fired)), [[EV, LEAD]]);
});

test('no consent layer → no browser event', () => {
  const { L } = load({ consent: null });
  assert.strictEqual(L.afterSave({ state: 'saved', eventId: EV }, LEAD), false);
});

test('measurement fields are added for the backend and stripped for Taviv App', () => {
  const consent = { adLeadFields: () => ({ ad_consent: 'granted', ad_consent_version: 'v', fbp: 'fb.1.1700000000000.123', client_user_agent: 'UA', event_source_url: 'https://taviv.co.il/check/' }) };
  const { L } = load({ consent, utm: 'smoke_test' });
  const full = L.withMeasurement({ lead_id: LEAD, full_name: 'x' });
  assert.strictEqual(full.ad_consent, 'granted');
  assert.strictEqual(full.is_test, '1');
  const app = L.withoutMeasurement(Object.assign({ entry_point: 'check' }, full));
  assert.deepStrictEqual(Object.keys(app).sort(), ['full_name', 'lead_id']);
});

test('declined consent sends no Meta identifiers', () => {
  const consent = { adLeadFields: () => ({ ad_consent: 'denied', ad_consent_version: 'v' }) };
  const { L } = load({ consent });
  const full = L.withMeasurement({ lead_id: LEAD });
  assert.strictEqual(full.fbp, undefined);
  assert.strictEqual(full.fbc, undefined);
  assert.strictEqual(full.client_user_agent, undefined);
  assert.strictEqual(full.is_test, '');
});
