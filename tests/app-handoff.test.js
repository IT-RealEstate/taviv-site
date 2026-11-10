// Run: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'app-handoff.js'), 'utf8');

function load({ responses = [], config = {} } = {}) {
  const calls = [];
  const store = new Map();
  const window = {
    INTAKE_CONFIG: Object.assign({
      mode: 'live', clientMarker: 'taviv-web-1', appHandoff: 'on',
      appOrigin: 'https://app.taviv.co.il',
      appLeadsUrl: 'https://app.taviv.co.il/api/public/leads',
      appEnrichmentUrl: 'https://app.taviv.co.il/api/public/leads/enrichment'
    }, config),
    crypto: crypto.webcrypto,
    setTimeout, clearTimeout
  };
  const ctx = {
    window, URL, AbortController,
    sessionStorage: { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) },
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      const next = responses.shift();
      if (!next) throw new Error('network');
      if (next instanceof Error) throw next;
      return { ok: next.status ? next.status < 300 : true, status: next.status || 200, json: async () => next.json };
    }
  };
  vm.runInNewContext(SRC, ctx);
  return { api: window.TAVIV_APP_HANDOFF, calls, store };
}

const PAYLOAD = { lead_id: 'LD-' + 'a'.repeat(64), client_marker: 'taviv-web-1', full_name: 'Test', phone_raw: '0521234567', email: '' };
const GOOD = { ok: true, destination: 'https://app.taviv.co.il/start?h=opaque123', enrichment_token: 'tok' };

test('create posts JSON with an Idempotency-Key and drops the long LD- id', async () => {
  const { api, calls } = load({ responses: [{ json: GOOD }] });
  assert.equal(await api.create(PAYLOAD), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://app.taviv.co.il/api/public/leads');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.match(calls[0].init.headers['Idempotency-Key'], /^[0-9a-f-]{36}$/);
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal('lead_id' in calls[0].body, false);
  assert.equal(api.destination(), GOOD.destination);
});

test('a short legacy LD- ref is kept', async () => {
  const { api, calls } = load({ responses: [{ json: GOOD }] });
  await api.create(Object.assign({}, PAYLOAD, { lead_id: 'LD-ABC23' }));
  assert.equal(calls[0].body.lead_id, 'LD-ABC23');
});

test('app unreachable -> no destination (WhatsApp stays), never throws', async () => {
  const { api } = load({ responses: [new Error('offline')] });
  assert.equal(await api.create(PAYLOAD), false);
  assert.equal(api.destination(), null);
});

test('HTTP error -> no destination', async () => {
  const { api } = load({ responses: [{ status: 503, json: { ok: false } }] });
  assert.equal(await api.create(PAYLOAD), false);
  assert.equal(api.destination(), null);
});

test('retry after failure reuses the same Idempotency-Key', async () => {
  const { api, calls } = load({ responses: [new Error('offline'), { json: GOOD }] });
  await api.create(PAYLOAD);
  assert.equal(await api.create(PAYLOAD), true);
  assert.equal(calls[0].init.headers['Idempotency-Key'], calls[1].init.headers['Idempotency-Key']);
});

test('only https://app.taviv.co.il/start?h=… is accepted as destination', () => {
  const { api } = load();
  assert.equal(api._safeDestination('https://evil.example/start?h=x'), null);
  assert.equal(api._safeDestination('https://app.taviv.co.il/start?h=x&phone=1'), null);
  assert.equal(api._safeDestination('https://app.taviv.co.il/other?h=x'), null);
  assert.equal(api._safeDestination('https://app.taviv.co.il/start?h=x#f'), null);
  assert.equal(api._safeDestination('https://app.taviv.co.il/start'), null);
  assert.equal(api._safeDestination('https://app.taviv.co.il/start?h=x'), 'https://app.taviv.co.il/start?h=x');
});

test('disabled outside live mode or when switched off: no network call', async () => {
  for (const config of [{ mode: 'dryrun' }, { appHandoff: 'off' }, { appLeadsUrl: '' }]) {
    const { api, calls } = load({ responses: [{ json: GOOD }], config });
    assert.equal(await api.create(PAYLOAD), false);
    assert.equal(calls.length, 0);
  }
});

test('enrichment sends only contract fields with the capability header and a new key', async () => {
  const { api, calls } = load({ responses: [{ json: GOOD }, { json: { ok: true, enriched: ['damage_type'] } }] });
  await api.create(PAYLOAD);
  assert.equal(await api.enrich({ lead_id: PAYLOAD.lead_id, damage_type: 'WATER', op: 'enrich', form_started_at: 'x' }), true);
  const e = calls[1];
  assert.equal(e.url, 'https://app.taviv.co.il/api/public/leads/enrichment');
  assert.equal(e.init.headers['Lead-Enrichment'], 'tok');
  assert.notEqual(e.init.headers['Idempotency-Key'], calls[0].init.headers['Idempotency-Key']);
  assert.deepEqual(e.body, { client_marker: 'taviv-web-1', damage_type: 'WATER' });
});

test('no enrichment when create never succeeded', async () => {
  const { api, calls } = load({ responses: [new Error('offline')] });
  await api.create(PAYLOAD);
  assert.equal(await api.enrich({ damage_type: 'WATER' }), false);
  assert.equal(calls.length, 1);
});

test('onDestination fires once the app answers', async () => {
  const { api } = load({ responses: [{ json: GOOD }] });
  let got = null;
  api.onDestination((u) => { got = u; });
  assert.equal(got, null);
  await api.create(PAYLOAD);
  assert.equal(got, GOOD.destination);
});
