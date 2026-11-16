// Run: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAW = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'measurement.js'), 'utf8');
const PIXEL = '123456789012345';
const LEAD = 'LD-' + 'c'.repeat(64);
const EV = 'ev_' + 'f'.repeat(32);

function load({ pixel = true, record = null, cookies = '', adLeads = null } = {}) {
  const src = pixel ? RAW.replace("var META_PIXEL_ID = '';", "var META_PIXEL_ID = '" + PIXEL + "';") : RAW;
  const local = new Map();
  if (record) local.set('tv_measure_consent', JSON.stringify(record));
  if (adLeads) local.set('tv_ad_leads', JSON.stringify(adLeads));
  const fbq = [];
  const posts = [];
  const resetHandlers = [];
  const cookieWrites = [];
  const document = {
    readyState: 'complete',
    body: { appendChild() {} },
    get cookie() { return cookies; },
    set cookie(v) { cookieWrites.push(v); },
    getElementById: () => null,
    querySelectorAll: (sel) => sel === '[data-consent-reset]'
      ? [{ addEventListener: (_t, fn) => resetHandlers.push(fn) }] : [],
    getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }],
    createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }),
    addEventListener() {}
  };
  const window = {
    location: { pathname: '/check/', origin: 'https://taviv.co.il', hostname: 'taviv.co.il', href: 'https://taviv.co.il/check/', search: '' },
    innerWidth: 400,
    localStorage: { getItem: (k) => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)), removeItem: (k) => local.delete(k) },
    history: { replaceState() {}, state: null },
    INTAKE_CONFIG: { endpointUrl: 'https://script.google.com/macros/s/X/exec', clientMarker: 'taviv-web-1' },
    crypto: require('node:crypto').webcrypto
  };
  window.fbq = function () { fbq.push(Array.prototype.slice.call(arguments)); };
  const ctx = {
    window, document, URL, URLSearchParams, JSON, Date,
    navigator: { userAgent: 'TestUA/1.0' },
    fetch: (url, init) => { posts.push(JSON.parse(init.body)); return Promise.resolve({ json: () => Promise.resolve({ ok: true }) }); }
  };
  vm.runInNewContext(src, ctx);
  return { C: window.TAVIV_CONSENT, fbq, posts, resetHandlers, cookieWrites, local };
}

const yes = (m) => ({ v: '2026-11-16.1', a: 'no', m, t: '2026-11-16T10:00:00.000Z' });

test('no choice yet → unset, no identifiers', () => {
  const { C } = load();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(C.adLeadFields())), { ad_consent: 'unset', ad_consent_version: '' });
});

test('a record from the previous consent version is ignored', () => {
  const { C } = load({ record: { v: '2026-11-10.1', c: 'yes' } });
  assert.strictEqual(C.ads(), false);
  assert.strictEqual(C.adLeadFields().ad_consent, 'unset');
});

test('declined → denied, no identifiers', () => {
  const { C } = load({ record: yes('no'), cookies: '_fbp=fb.1.1700000000000.1234567890' });
  const f = C.adLeadFields();
  assert.strictEqual(f.ad_consent, 'denied');
  assert.strictEqual(f.fbp, undefined);
});

test('granted → identifiers and a URL without query', () => {
  const { C } = load({ record: yes('yes'), cookies: '_fbp=fb.1.1700000000000.1234567890; _fbc=fb.1.1700000000001.AbCdEfGhIjKlMn' });
  const f = C.adLeadFields();
  assert.strictEqual(f.ad_consent, 'granted');
  assert.strictEqual(f.fbp, 'fb.1.1700000000000.1234567890');
  assert.strictEqual(f.fbc, 'fb.1.1700000000001.AbCdEfGhIjKlMn');
  assert.strictEqual(f.event_source_url, 'https://taviv.co.il/check/');
  assert.strictEqual(f.client_user_agent, 'TestUA/1.0');
});

test('malformed cookie values are dropped, never invented', () => {
  const { C } = load({ record: yes('yes'), cookies: '_fbp=garbage; _fbc=fb.1.x.y' });
  const f = C.adLeadFields();
  assert.strictEqual(f.fbp, '');
  assert.strictEqual(f.fbc, '');
});

test('granted consent but no Pixel id configured → treated as no Meta', () => {
  const { C } = load({ pixel: false, record: yes('yes') });
  assert.strictEqual(C.adLeadFields().ad_consent, 'denied');
  assert.strictEqual(C.trackLead(EV, LEAD), false);
});

test('Lead is tracked with the server event id, only with consent', () => {
  const off = load({ record: yes('no') });
  assert.strictEqual(off.C.trackLead(EV, LEAD), false);
  const on = load({ record: yes('yes') });
  assert.strictEqual(on.C.trackLead('not-an-id', LEAD), false);
  assert.strictEqual(on.C.trackLead(EV, LEAD), true);
  const lead = on.fbq.find((c) => c[0] === 'track' && c[1] === 'Lead');
  assert.ok(lead);
  assert.strictEqual(lead[3].eventID, EV);
  assert.ok(on.fbq.some((c) => c[0] === 'set' && c[1] === 'autoConfig' && c[2] === false));
  assert.ok(JSON.parse(on.local.get('tv_ad_leads')).some((x) => x.id === LEAD));
});

test('withdrawal revokes the Pixel, clears Meta cookies and tells the server which leads', () => {
  const t = load({ record: yes('yes'), adLeads: [{ id: LEAD, t: Date.now() }] });
  t.resetHandlers.forEach((fn) => fn());
  assert.ok(t.fbq.some((c) => c[0] === 'consent' && c[1] === 'revoke'));
  assert.ok(t.cookieWrites.some((c) => /^_fbp=; Max-Age=0/.test(c)));
  assert.ok(t.cookieWrites.some((c) => /^_fbc=; Max-Age=0/.test(c)));
  assert.strictEqual(t.posts.length, 1);
  assert.strictEqual(t.posts[0].op, 'consent');
  assert.strictEqual(t.posts[0].ad_consent, 'withdrawn');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(t.posts[0].lead_ids)), [LEAD]);
});
