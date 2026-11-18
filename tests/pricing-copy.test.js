// Offline copy regression for the draft pricing model.
// Run: node --test tests/pricing-copy.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const pricing = read('pricing/index.html');
const faq = read('faq/index.html');
const damage = read('damage/index.html');
const surfaces = { pricing, faq, damage };

const REPORT_FACTORS = ['היקף התיק', 'דוחות אחרים', 'נזק מהותי', 'מורכבות החישוב'];
const CONTRADICTIONS = [
  'שכר הטרחה נקבע מראש',
  'אינו נגזר כאחוז מהפיצוי',
  'אינו תלוי בסכום התביעה',
  'המחיר ידוע לפני שמתחילים',
  'נציג את המחיר מראש',
  'אינו משתנה לפי הממצאים'
];

function jsonLd(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.ok(blocks.length > 0);
  return blocks;
}

test('report-only price stays on the existing card, value first, with court context', () => {
  const card = pricing.slice(
    pricing.indexOf('דוח או חוות דעת בלבד'),
    pricing.indexOf('טיפול מלא בתיק בשבילכם')
  );
  assert.match(card, /<span dir="ltr">899<\/span> עד <span dir="ltr">1,499<\/span> ₪, ועוד מע״מ/);
  const priceAt = card.indexOf('899');
  const noteAt = card.indexOf('dmg-pricing__note');
  assert.ok(priceAt > -1 && noteAt > priceAt);
  for (const factor of REPORT_FACTORS) assert.ok(card.includes(factor), factor);
  assert.match(card, /בעיקר לדוח לבית משפט או להליך משפטי/);
  assert.equal(card.includes('חינם') || card.includes('בחינם'), false);
});

test('metadata and JSON-LD repeat the same report range and do not price the success fee', () => {
  assert.equal(
    (pricing.match(/content="לבדוק אם ההצעה של חברת הביטוח הוגנת\. בדיקה בעוזר של טביב, ללא עלות\. דוח בלבד, בעיקר לבית משפט: 899 עד 1,499 ₪, ועוד מע״מ, לפי היקף התיק, דוחות אחרים, נזק מהותי ומורכבות החישוב\. טיפול מלא: חלק מהסכום שנגבה, בסוף\."/g) || []).length,
    2
  );
  const offer = jsonLd(pricing)[0].hasOfferCatalog.itemListElement;
  assert.equal(offer.length, 3);
  assert.equal(offer[0].price, '0');
  assert.match(offer[0].description, /ללא עלות/);
  assert.equal(offer[1].name, 'דוח או חוות דעת בלבד');
  assert.match(offer[1].description, /^899 עד 1,499 ₪, ועוד מע״מ\./);
  for (const factor of REPORT_FACTORS) assert.ok(offer[1].description.includes(factor), factor);
  assert.match(offer[1].description, /בית משפט או להליך משפטי/);
  assert.equal(offer[1].priceSpecification.minPrice, 899);
  assert.equal(offer[1].priceSpecification.maxPrice, 1499);
  assert.equal(offer[1].priceSpecification.valueAddedTaxIncluded, false);
  assert.equal(offer[1].priceSpecification.priceCurrency, 'ILS');
  assert.equal(offer[2].name, 'טיפול מלא בתיק');
  assert.match(offer[2].description, /חלק מהסכום שנגבה, בסוף/);
  assert.equal('price' in offer[2], false);
  assert.equal('priceSpecification' in offer[2], false);
  assert.equal(JSON.stringify(offer).includes('%'), false);
});

test('FAQ and damage no longer claim a fixed advance fee unrelated to compensation', () => {
  for (const [name, html] of Object.entries(surfaces)) {
    for (const phrase of CONTRADICTIONS) {
      assert.equal(html.includes(phrase), false, name + ' still says: ' + phrase);
    }
    assert.equal(html.includes('חינם'), false, name);
    assert.equal(html.includes('בחינם'), false, name);
    assert.equal(/\d+(?:[.,]\d+)?\s*(?:%|אחוז)/.test(html), false, name + ' has a numeric percentage');
  }
  for (const factor of REPORT_FACTORS) {
    assert.ok(faq.includes(factor), 'faq ' + factor);
    assert.ok(damage.includes(factor), 'damage ' + factor);
  }
  assert.match(faq, /דוח בלבד: <span dir="ltr">899<\/span> עד <span dir="ltr">1,499<\/span> ₪, ועוד מע״מ/);
  assert.match(faq, /טיפול מלא: חלק מהסכום שנגבה, בסוף/);
  assert.match(faq, /ללא עלות/);
  assert.match(damage, /דוח בלבד: <span dir="ltr">899<\/span> עד <span dir="ltr">1,499<\/span> ₪, ועוד מע״מ/);
  assert.match(damage, /טיפול מלא: חלק מהסכום שנגבה, בסוף/);
  assert.match(damage, /איני מקבל עמלות מקבלנים או מספקים/);
  assert.match(damage, /בדיקה ראשונית וללא עלות/);
  assert.match(damage, /דוח בלבד לפי המורכבות, או טיפול מלא ששכרו משולם בסוף/);
});

test('pricing CTAs stay split and the check is ללא עלות', () => {
  assert.match(pricing, /data-cta-location="sticky"[^>]*href="\/check\/"/);
  assert.match(pricing, /href="\/check\/">צור קשר<\/a><\/li>/);
  assert.match(pricing, /data-cta-location="pricing"[^>]*href="\/assistant\/"/);
  assert.match(pricing, /בדיקה בעוזר, ללא עלות/);
  assert.match(pricing, />להתחיל בדיקה ללא עלות</);
  assert.equal(pricing.includes('חינם') || pricing.includes('בחינם'), false);
});

test('legal §22, intake config, and handoff entry points stay untouched', () => {
  const legal = read('legal/index.html');
  assert.match(legal, /<article class="c" id="s22">/);
  assert.match(legal, /המחיר המוצג באתר הוא המחיר המלא למסלול המתואר\. אין תוספת שאינה מופיעה במסמך ההתקשרות, ואין תוספת בלי אישור מראש בכתב\./);
  const config = read('assets/js/intake-config.js');
  assert.match(config, /endpointUrl: 'https:\/\/script\.google\.com\/macros\/s\/AKfycbz/);
  assert.match(config, /appHandoff: 'on'/);
  assert.match(config, /appLongLeadRef: 'off'/);
  assert.match(config, /appLeadsUrl: 'https:\/\/app\.taviv\.co\.il\/api\/public\/leads'/);
  const handoff = read('assets/js/app-handoff.js');
  assert.match(handoff, /cfg\(\)\.appLeadsUrl/);
  assert.match(handoff, /Idempotency-Key/);
  assert.match(handoff, /Lead-Enrichment/);
  for (const version of ['2026-09-01.2', '2026-09-04.1', '2026-11-10.1']) {
    assert.match(
      read('legal/v/' + version + '/index.html'),
      /המחיר המוצג באתר הוא המחיר המלא למסלול המתואר/
    );
  }
  assert.equal(read('check/index.html').includes('1,499'), false);
  assert.equal(read('assistant/index.html').includes('1,499'), false);
});
