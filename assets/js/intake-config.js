window.INTAKE_CONFIG = {
  endpointUrl: 'https://script.google.com/macros/s/AKfycbzDmJ0f0JybL608lRHB88cyqJuV-djodgIZKZ8gBv2iEUcKhElrg7sOrpFZ8591gmo6/exec',
  clientMarker: 'taviv-web-1',
  mode: 'live',
  leadPersistence: 'auto',
  whatsappNumber: '972552617625',
  whatsappMessage: 'שלום, הגעתי מאתר טביב שמאות ואני רוצה לבדוק מקרה נזק.',
  handoffUrlTemplate: ''
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
