window.INTAKE_CONFIG = {
  endpointUrl: 'https://script.google.com/macros/s/AKfycbzDmJ0f0JybL608lRHB88cyqJuV-djodgIZKZ8gBv2iEUcKhElrg7sOrpFZ8591gmo6/exec',
  clientMarker: 'taviv-web-1',
  mode: 'live',
  leadPersistence: 'auto',
  whatsappNumber: '972552617625',
  whatsappMessage: 'שלום, הגעתי מאתר טביב שמאות ואני רוצה לבדוק מקרה נזק.',
  // Reserved for the W3 WhatsApp association code ({code}); NOT the app /start link.
  // Web continuation uses the app's `destination` as received (handoff contract v2 §5, §8).
  handoffUrlTemplate: '',
  // Parallel hand-off to Taviv App. Runs next to the Apps Script save above, never instead
  // of it. 'off' disables it without touching anything else.
  appHandoff: 'on',
  // 'on' needs taviv-app#334 live (app stores the LD-<64 hex> website id); 'off' omits it.
  appLongLeadRef: 'on',
  appOrigin: 'https://app.taviv.co.il',
  appLeadsUrl: 'https://app.taviv.co.il/api/public/leads',
  appEnrichmentUrl: 'https://app.taviv.co.il/api/public/leads/enrichment'
};

window.TAVIV_CONTACT = (function () {
  var cfg = window.INTAKE_CONFIG || {};

  function leadPersistenceAvailable() {
    if (cfg.leadPersistence === 'off') { return false; }
    if (cfg.mode === 'prelaunch') { return false; }
    if (cfg.mode === 'dryrun') { return true; }   // the beta completes the flow on purpose
    return typeof cfg.endpointUrl === 'string' && cfg.endpointUrl !== '';
  }

  function whatsappUrl() {
    var n = cfg.whatsappNumber || '';
    var m = cfg.whatsappMessage || '';
    return 'https://wa.me/' + n + (m ? '?text=' + encodeURIComponent(m) : '');
  }

  function continuationUrl(publicCode) {
    var t = cfg.handoffUrlTemplate;
    if (t && publicCode) { return t.replace('{code}', encodeURIComponent(publicCode)); }
    return whatsappUrl();
  }

  return {
    leadPersistenceAvailable: leadPersistenceAvailable,
    whatsappUrl: whatsappUrl,
    continuationUrl: continuationUrl,
    telUrl: 'tel:+972552617625'
  };
})();
