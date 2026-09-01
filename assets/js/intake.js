(function () {
  'use strict';

  try {
    var fallback = document.querySelector('[data-intake-fallback]');
    var app = document.querySelector('[data-intake-app]');
    var form = document.querySelector('[data-intake-form]');
    if (!form) {
      throw new Error('intake form not found');
    }

    var TOTAL_STEPS = 3;
    var STORAGE_KEY = 'intake_draft_v2';
    var LEAD_ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I/L

    var LEGAL_RELEASE = '2026-09-01.2';

    var SUBMIT_TIMEOUT_MS = 10000;
    var RETRY_DELAY_MS = 2000;
    var DRYRUN_DELAY_MS = 700;

    var RADIO_GROUPS = ['damage_type', 'case_state'];
    var SHORT_DESCRIPTION_MAX = 1000;
    var TEXT_FIELDS = ['full_name', 'phone_raw', 'email', 'property_city'];
    var OPTIONAL_TEXT_FIELDS = ['short_description'];

    var state = {
      lead_id: '',
      step: 1,
      damage_type: '',
      case_state: '',
      full_name: '',
      phone_raw: '',
      email: '',
      property_city: '',
      short_description: '',
      form_started_at: ''
    };

    var persistInFlight = false;
    var failureCount = 0;

    function newLeadId() {
      var bytes = new Uint8Array(5);
      crypto.getRandomValues(bytes);
      var body = '';
      for (var i = 0; i < bytes.length; i++) {
        body += LEAD_ID_ALPHABET[bytes[i] % LEAD_ID_ALPHABET.length];
      }
      return 'LD-' + body;
    }

    function saveState() {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
      }
    }

    function loadState() {
      try {
        var raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          for (var key in state) {
            if (Object.prototype.hasOwnProperty.call(parsed, key)) {
              state[key] = parsed[key];
            }
          }
        }
      } catch (e) {
      }
    }

    function isValidIsraeliPhone(raw) {
      var digits = (raw || '').replace(/[\s\-()]/g, '');
      return /^05\d{8}$/.test(digits) ||
             /^\+9725\d{8}$/.test(digits) ||
             /^9725\d{8}$/.test(digits);
    }

    function detectBrowserContext() {
      var ua = navigator.userAgent || '';
      if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|musical_ly|Snapchat/i.test(ua)) {
        return 'in_app_browser';
      }
      var coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || coarsePointer;
      return isMobile ? 'mobile_browser' : 'desktop_browser';
    }

    var MESSAGES = {
      full_name:      { missing: 'צריך שם מלא כדי שנדע למי לפנות.' },
      phone_raw:      { missing: 'צריך מספר טלפון כדי שנוכל לחזור אליך.',
                        invalid: 'המספר לא נראה שלם. כדאי לבדוק שוב.' },
      email:          { missing: 'צריך כתובת אימייל.',
                        invalid: 'כתובת האימייל לא נראית תקינה. כדאי לבדוק שוב.' },
      property_city:  { missing: 'צריך להזין את יישוב הנכס.' },
      damage_type:    { missing: 'צריך לבחור סוג נזק.' },
      case_state:     { missing: 'צריך לבחור את המצב שהכי קרוב.' },
      short_description: { tooLong: 'ניתן להזין עד 1,000 תווים.' }
    };

    function codePointLength(value) {
      return typeof value === 'string' ? Array.from(value).length : 0;
    }

    function validateShortDescription() {
      var input = form.querySelector('#short_description');
      if (!input) return true;
      var errorEl = document.getElementById('short_description-error');
      var ok = codePointLength(input.value) <= SHORT_DESCRIPTION_MAX;
      input.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (errorEl) errorEl.textContent = ok ? '' : MESSAGES.short_description.tooLong;
      return ok;
    }

    function isHidden(el) {
      var node = el;
      while (node && node !== form) {
        if (node.hidden) return true;
        node = node.parentElement;
      }
      return false;
    }

    function validateGroup(name) {
      var errorEl = document.getElementById(name + '-error');
      var checked = form.querySelector('input[name="' + name + '"]:checked');
      var ok = !!checked;
      if (errorEl) errorEl.textContent = ok ? '' : MESSAGES[name].missing;
      return ok;
    }

    function validateTextField(input) {
      var errorEl = document.getElementById(input.id + '-error');
      var value = input.value.trim();
      var msgs = MESSAGES[input.id];
      var ok = true;
      var message = '';

      if (value === '') {
        ok = false;
        message = msgs.missing;
      } else if (input.id === 'phone_raw' && !isValidIsraeliPhone(value)) {
        ok = false;
        message = msgs.invalid;
      } else if (input.id === 'email' && !input.checkValidity()) {
        ok = false;
        message = msgs.invalid;
      }

      input.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (errorEl) errorEl.textContent = message;
      return ok;
    }

    function validateStep(n) {
      var stepEl = form.querySelector('.intake-step[data-step="' + n + '"]');
      var firstInvalid = null;

      RADIO_GROUPS.forEach(function (name) {
        var fieldset = stepEl.querySelector('[data-group="' + name + '"]');
        if (!fieldset || isHidden(fieldset)) return;
        var ok = validateGroup(name);
        if (!ok && !firstInvalid) {
          firstInvalid = fieldset.querySelector('input[name="' + name + '"]');
        }
      });

      TEXT_FIELDS.forEach(function (name) {
        var input = stepEl.querySelector('#' + name);
        if (!input || isHidden(input)) return;
        var ok = validateTextField(input);
        if (!ok && !firstInvalid) {
          firstInvalid = input;
        }
      });

      var shortDesc = stepEl.querySelector('#short_description');
      if (shortDesc && !isHidden(shortDesc) && !validateShortDescription() && !firstInvalid) {
        firstInvalid = shortDesc;
      }

      if (firstInvalid) {
        firstInvalid.focus();
        return false;
      }
      return true;
    }

    function goToStep(n, opts) {
      opts = opts || {};
      state.step = n;
      form.querySelectorAll('.intake-step').forEach(function (sec) {
        sec.hidden = Number(sec.getAttribute('data-step')) !== n;
      });
      saveState();
      if (opts.focus !== false) {
        var heading = form.querySelector('.intake-step[data-step="' + n + '"] .intake-step__title');
        if (heading) heading.focus();
      }
    }

    function bindEvents() {
      form.querySelectorAll('[data-action="next"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (validateStep(state.step)) {
            goToStep(Math.min(state.step + 1, TOTAL_STEPS));
          }
        });
      });

      form.querySelectorAll('[data-action="back"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          goToStep(Math.max(state.step - 1, 1), { focus: true });
        });
      });

      form.addEventListener('change', function (e) {
        var t = e.target;
        if (!t.name || t.name === 'website') return;

        if (t.type === 'radio') {
          if (t.checked) state[t.name] = t.value;
          var errorEl = document.getElementById(t.name + '-error');
          if (errorEl && errorEl.textContent) validateGroup(t.name);
        } else {
          state[t.name] = t.value;
          if (t.getAttribute('aria-invalid') === 'true') {
            if (t.id === 'short_description') validateShortDescription();
            else validateTextField(t);
          }
        }

        saveState();
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!validateStep(TOTAL_STEPS)) return;
        attemptPersist();
      });

      form.querySelectorAll('[data-action="retry-submit"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (!validateStep(TOTAL_STEPS)) return;
          attemptPersist();
        });
      });
    }

    function showSuccessState() {
      var success = document.querySelector('[data-intake-success]');
      form.hidden = true;
      success.hidden = false;
      success.focus();
    }

    function setSubmitDisabled(disabled) {
      form.querySelectorAll('button[type="submit"], [data-action="retry-submit"]').forEach(function (btn) {
        btn.disabled = disabled;
      });
    }

    function showSendingStatus(visible) {
      form.querySelector('[data-sending-status]').hidden = !visible;
    }

    function hideSubmitError() {
      form.querySelector('[data-submit-error]').hidden = true;
    }

    function buildPayload() {
      var honeypotInput = document.getElementById('website');
      var attribution = window.ATTRIBUTION;
      var attributionRecord = attribution ? attribution.get() : {};

      return {
        lead_id: state.lead_id,
        source: attribution ? attribution.source() : '',
        cta_location: attribution ? attribution.ctaLocation() : '',
        service_interest: attribution ? attribution.serviceInterest() : '',
        service_price_revealed: attribution ? attribution.servicePriceRevealed() : '',
        service_log: attribution ? attribution.serviceLog() : '',
        browser_context: detectBrowserContext(),
        damage_type: state.damage_type,
        case_state: state.case_state,
        full_name: state.full_name,
        phone_raw: state.phone_raw,
        email: state.email,
        property_city: state.property_city,
        short_description: state.short_description,
        notice_version: LEGAL_RELEASE,
        policy_version: LEGAL_RELEASE,
        client_marker: window.INTAKE_CONFIG ? window.INTAKE_CONFIG.clientMarker : '',
        honeypot: honeypotInput ? honeypotInput.value : '',
        form_started_at: state.form_started_at,
        utm_source: attributionRecord.utm_source || '',
        utm_medium: attributionRecord.utm_medium || '',
        utm_campaign: attributionRecord.utm_campaign || '',
        utm_content: attributionRecord.utm_content || '',
        utm_term: attributionRecord.utm_term || '',
        fbclid: attributionRecord.fbclid || '',
        referrer: attributionRecord.referrer || '',
        landing_route: attributionRecord.landing_route || '',
        source_page: attributionRecord.source_page || ''
      };
    }

    function sendLead() {
      var endpointUrl = window.INTAKE_CONFIG && window.INTAKE_CONFIG.endpointUrl;
      return fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(buildPayload()),
        signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS)
      }).then(function (res) {
        return res.json();
      });
    }

    function attemptPersist() {
      if (persistInFlight) return;

      var config = window.INTAKE_CONFIG || {};

      if (config.mode === 'dryrun' || config.mode === 'prelaunch') {
        persistInFlight = true;
        setSubmitDisabled(true);
        hideSubmitError();
        showSendingStatus(true);
        window.setTimeout(function () {
          onPersistSuccess();
        }, DRYRUN_DELAY_MS);
        return;
      }

      var endpointUrl = config.endpointUrl;
      if (!endpointUrl) {
        onPersistFailure();
        return;
      }

      persistInFlight = true;
      setSubmitDisabled(true);
      hideSubmitError();
      showSendingStatus(true);

      sendLead()
        .then(function (json) {
          if (json && json.ok) {
            onPersistSuccess();
          } else {
            return retryOnce();
          }
        })
        .catch(function () {
          return retryOnce();
        });
    }

    function retryOnce() {
      return new Promise(function (resolve) {
        setTimeout(resolve, RETRY_DELAY_MS);
      })
        .then(sendLead)
        .then(function (json) {
          if (json && json.ok) {
            onPersistSuccess();
          } else {
            onPersistFailure();
          }
        })
        .catch(function () {
          onPersistFailure();
        });
    }

    function onPersistSuccess() {
      persistInFlight = false;
      failureCount = 0;
      showSendingStatus(false);
      setSubmitDisabled(false);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
      showSuccessState();
    }

    function onPersistFailure() {
      persistInFlight = false;
      failureCount += 1;
      showSendingStatus(false);
      setSubmitDisabled(false);

      var errorEl = form.querySelector('[data-submit-error]');
      errorEl.hidden = false;
      form.querySelector('[data-submit-fallback]').hidden = failureCount < 2;
      errorEl.focus();
    }

    function restoreUIFromState() {
      RADIO_GROUPS.forEach(function (name) {
        if (!state[name]) return;
        var input = form.querySelector('input[name="' + name + '"][value="' + state[name] + '"]');
        if (input) input.checked = true;
      });
      TEXT_FIELDS.concat(OPTIONAL_TEXT_FIELDS).forEach(function (name) {
        var input = form.querySelector('#' + name);
        if (input && state[name]) input.value = state[name];
      });
      goToStep(state.step || 1, { focus: false });
    }

    loadState();
    if (!state.lead_id) state.lead_id = newLeadId();
    if (!state.form_started_at) state.form_started_at = new Date().toISOString();
    restoreUIFromState();
    bindEvents();
    saveState();

    fallback.hidden = true;
    app.hidden = false;
  } catch (err) {
    console.error('Intake failed to initialize:', err);
  }
})();
