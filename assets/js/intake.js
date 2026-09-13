(function () {
  'use strict';

  try {
    var fallback = document.querySelector('[data-intake-fallback]');
    var app = document.querySelector('[data-intake-app]');
    var form = document.querySelector('[data-intake-form]');
    if (!form) {
      throw new Error('intake form not found');
    }

    var measurement = window.TAVIV_MEASUREMENT;
    var measurementStarted = false;
    var measurementSubmitEventId = '';

    function measure(eventName, params) {
      try {
        if (measurement && typeof measurement.trackEvent === 'function') {
          measurement.trackEvent(eventName, params || {});
        }
      } catch (e) {
      }
    }

    function markIntakeStarted() {
      if (measurementStarted) return;
      measurementStarted = true;
      measure('intake_start', {
        intake_step_id: phase && phase !== 'done' ? phase : 'contact'
      });
    }

    function recordValidationError(fieldId, errorCode) {
      measure('intake_validation_error', {
        intake_step_id: phase && phase !== 'done' ? phase : 'contact',
        field_id: fieldId,
        error_code: errorCode
      });
    }

    function beginMeasurementSubmitAttempt() {
      measurementSubmitEventId = measurement &&
        typeof measurement.createEventId === 'function'
        ? measurement.createEventId()
        : '';
      if (measurementSubmitEventId) {
        measure('intake_submit_attempt', {
          event_id: measurementSubmitEventId,
          intake_step_id: 'contact'
        });
      }
    }

    var TOTAL_STEPS = 1;
    var STORAGE_KEY = 'intake_draft_v2';
    var LEAD_ID_PATTERN = /^LD-[0-9a-f]{64}$/;

    var LEGAL_RELEASE = '2026-09-04.1';

    var SUBMIT_TIMEOUT_MS = 15000;
    var RETRY_DELAY_MS = 2000;
    var DRYRUN_DELAY_MS = 700;

    var RADIO_GROUPS = [];
    var SHORT_DESCRIPTION_MAX = 1000;
    var TEXT_FIELDS = ['full_name', 'phone_raw', 'property_city'];
    var OPTIONAL_TEXT_FIELDS = ['email', 'short_description'];

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
      form_started_at: '',
      lead_saved: false
    };

    var persistInFlight = false;
    var failureCount = 0;

    var saveSeq = 0;
    var inFlightSeq = 0;
    var leadCreated = false;          // the server confirmed a row exists
    var savedSnapshot = null;         // the exact values that row was created from
    var userInteracted = false;       // a real edit, not an autofill-on-load
    var enrichSeq = 0;
    var enrichInFlightFor = '';       // which question is being saved right now
    var phase = 'contact';            // contact -> damage_type -> case_state -> done

    function newLeadId() {
      var bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      var hex = '';
      for (var i = 0; i < bytes.length; i++) {
        hex += ('0' + bytes[i].toString(16)).slice(-2);
      }
      return 'LD-' + hex;
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

    function phoneLooksShort(raw) {
      var digits = (raw || '').replace(/[\s\-()+]/g, '');
      if (/^972/.test(digits)) digits = '0' + digits.slice(3);
      return /^05\d{7}$/.test(digits);
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
                        short:   'נראה שחסרה ספרה במספר הטלפון.',
                        invalid: 'הזינו מספר טלפון נייד תקין בן 10 ספרות.' },
      email:          { missing: 'צריך כתובת אימייל.',
                        invalid: 'כתובת האימייל לא נראית תקינה. כדאי לבדוק שוב.' },
      property_city:  { missing: 'צריך להזין את יישוב הנכס.' },
      damage_type:    { missing: 'צריך לבחור סוג נזק.' },
      case_state:     { missing: 'צריך לבחור את המצב שהכי קרוב.' },
      short_description: { tooLong: 'ניתן להזין עד 1,000 תווים.' }
    };

    var AUTOSAVE_MESSAGES = {
      saved:     'הפרטים נשמרו',
      failed:    'לא הצלחנו לשמור כרגע. הפרטים נשארו כאן ואפשר לנסות שוב.'
    };
    var QUESTION_SAVING = 'שומר…';
    var QUESTION_FAILED = 'לא הצלחנו לשמור את התשובה. אפשר לנסות שוב.';

    var QUESTIONS = ['damage_type', 'case_state'];
    var QUESTION_TITLES = { damage_type: 'סוג הנזק', case_state: 'מצב המקרה' };

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
      if (!ok) recordValidationError('short_description', 'too_long');
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
      if (!ok) recordValidationError(name, 'required');
      return ok;
    }

    function validateTextField(input) {
      var errorEl = document.getElementById(input.id + '-error');
      var value = input.value.trim();
      var msgs = MESSAGES[input.id];
      var ok = true;
      var message = '';

      if (value === '' && OPTIONAL_TEXT_FIELDS.indexOf(input.id) !== -1) {
        ok = true;
      } else if (value === '') {
        ok = false;
        message = msgs.missing;
      } else if (input.id === 'phone_raw' && !isValidIsraeliPhone(value)) {
        ok = false;
        message = phoneLooksShort(value) ? msgs.short : msgs.invalid;
        input.setAttribute('aria-invalid', 'true');
        if (errorEl) errorEl.textContent = message;
        recordValidationError(input.id, 'invalid_format');
        return false;
        message = msgs.invalid;
      } else if (input.id === 'email' && !input.checkValidity()) {
        ok = false;
        message = msgs.invalid;
      }

      input.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (errorEl) errorEl.textContent = message;
      if (!ok) {
        recordValidationError(input.id, value === '' ? 'required' : 'invalid_format');
      }
      return ok;
    }

    function validateStep() {
      var stepEl = form.querySelector('.intake-step[data-step="contact"]');
      var firstInvalid = null;

      RADIO_GROUPS.forEach(function (name) {
        var fieldset = stepEl.querySelector('[data-group="' + name + '"]');
        if (!fieldset || isHidden(fieldset)) return;
        var ok = validateGroup(name);
        if (!ok && !firstInvalid) {
          firstInvalid = fieldset.querySelector('input[name="' + name + '"]');
        }
      });

      TEXT_FIELDS.concat(OPTIONAL_TEXT_FIELDS).forEach(function (name) {
        var input = stepEl.querySelector('#' + name);
        if (!input || isHidden(input)) return;
        var ok = validateTextField(input);
        if (!ok && !firstInvalid) {
          firstInvalid = input;
        }
      });

      if (firstInvalid) {
        firstInvalid.focus();
        return false;
      }
      return true;
    }

    function ui(event, id) {
      if (window.ATTRIBUTION && typeof window.ATTRIBUTION.recordUiEvent === 'function') {
        window.ATTRIBUTION.recordUiEvent(event, id, 'check');
      }
    }

    function setAutosaveStatus(key) {
      var el = form.querySelector('[data-autosave-status]');
      if (!el) return;
      if (!key) { el.hidden = true; el.textContent = ''; el.removeAttribute('data-state'); return; }
      el.hidden = false;
      el.textContent = AUTOSAVE_MESSAGES[key];
      el.setAttribute('data-state', key);
    }

    function contactValues() {
      var name = form.querySelector('#full_name');
      var phone = form.querySelector('#phone_raw');
      var email = form.querySelector('#email');
      var city = form.querySelector('#property_city');
      return {
        full_name: name ? name.value.trim() : '',
        phone_raw: phone ? phone.value.trim() : '',
        email: email ? email.value.trim() : '',
        property_city: city ? city.value.trim() : ''
      };
    }

    function emailIsSendable(value) {
      var input = form.querySelector('#email');
      if (value === '') return false;
      return !!input && input.checkValidity();
    }

    function acknowledgementSatisfied() {
      var box = form.querySelector('[data-legal-ack]');
      return !box || box.checked;
    }

    function autosaveEligible() {
      if (!acknowledgementSatisfied()) return false;
      var v = contactValues();
      if (v.full_name === '') return false;
      if (v.property_city === '') return false;
      if (!isValidIsraeliPhone(v.phone_raw)) return false;
      return true;
    }

    var CONTACT_FIELDS = ['full_name', 'phone_raw', 'email', 'property_city'];

    function setContactReadOnly(value) {
      CONTACT_FIELDS.forEach(function (id) {
        var input = form.querySelector('#' + id);
        if (input) input.readOnly = value;
      });
    }

    function runAutosave() {
      if (!autosaveEligible()) return;

      var emailInput = form.querySelector('#email');
      if (emailInput && emailInput.value.trim() !== '') validateTextField(emailInput);

      var snapshot = contactValues();
      saveSeq += 1;
      var seq = saveSeq;

      if (leadCreated) return;

      if (persistInFlight) return;
      persistInFlight = true;
      inFlightSeq = seq;
      setContactReadOnly(true);
      setAutosaveStatus(null);
      hideSubmitError();
      ui('contact_autosave_started', 'contact');

      persistSnapshot(snapshot, seq);
    }

    function persistSnapshot(snapshot, seq) {
      var config = window.INTAKE_CONFIG || {};

      var finish = function (ok) {
        persistInFlight = false;
        if (ok) onAutosaveSuccess(snapshot, seq);
        else onAutosaveFailure();
      };

      if (config.mode === 'dryrun') {
        window.setTimeout(function () { finish(true); }, DRYRUN_DELAY_MS);
        return;
      }

      Promise.resolve().then(function () {
        var payload = buildPayload();

        function attempt() {
          return sendLead(payload).then(function (json) {
            return { confirmed: createConfirmed(json, payload.lead_id), json: json };
          }, function () {
            return { confirmed: false, json: null };
          });
        }

        return attempt().then(function (first) {
          if (first.confirmed) return true;
          if (!isRetryable(first.json)) return false;
          return new Promise(function (resolve) {
            window.setTimeout(resolve, RETRY_DELAY_MS);
          }).then(attempt).then(function (second) { return second.confirmed; });
        });
      }).then(finish, function () { finish(false); });
    }

    function createConfirmed(json, leadId) {
      return !!(json && json.ok === true &&
        json.lead_id === leadId &&
        typeof json.duplicate === 'boolean');
    }

    function isRetryable(json) {
      if (!json) return true;
      return json.code === 'server_busy' || json.code === 'server_error';
    }

    function onAutosaveSuccess(snapshot, seq) {
      leadCreated = true;
      failureCount = 0;
      savedSnapshot = snapshot;
      state.lead_saved = true;
      saveState();
      if (measurementSubmitEventId) {
        measure('intake_submit_success', { event_id: measurementSubmitEventId });
      }
      measure('intake_step_complete', { intake_step_id: 'contact' });

      ui('contact_autosave_succeeded', 'contact');
      setAutosaveStatus('saved');
      setContinueBusy(false);
      markContactSaved();
      revealQuestion('damage_type');
    }

    function markContactSaved() {
      setContactReadOnly(true);
      var contact = form.querySelector('.intake-step[data-step="contact"]');
      if (contact) { contact.setAttribute('data-saved', 'true'); }
      var nav = contact && contact.querySelector('.intake-step__nav');
      if (nav) { nav.hidden = true; }
    }

    function restoreSavedLead() {
      leadCreated = true;
      savedSnapshot = contactValues();
      setAutosaveStatus('saved');
      markContactSaved();
      revealQuestion('damage_type');
    }

    function onAutosaveFailure() {
      setContactReadOnly(false);
      setContinueBusy(false);
      failureCount += 1;
      if (measurementSubmitEventId) {
        measure('intake_submit_error', {
          event_id: measurementSubmitEventId,
          error_code: 'unknown_safe',
          intake_step_id: 'contact'
        });
      }
      ui('contact_autosave_failed', 'contact');
      setAutosaveStatus('failed');
      var errorEl = form.querySelector('[data-submit-error]');
      if (errorEl) {
        errorEl.hidden = false;
        var fb = form.querySelector('[data-submit-fallback]');
        if (fb) fb.hidden = failureCount < 2;
      }
    }

    function postIntakeJson(body) {
      return Promise.resolve().then(function () {
        var config = window.INTAKE_CONFIG || {};
        if (!config.endpointUrl || typeof fetch !== 'function' ||
            typeof AbortController !== 'function') {
          throw new Error('transport_unavailable');
        }
        var controller = new AbortController();
        var timer = window.setTimeout(function () { controller.abort(); }, SUBMIT_TIMEOUT_MS);
        return Promise.resolve().then(function () {
          return fetch(config.endpointUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(body),
            signal: controller.signal
          });
        }).then(function (response) {
          if (!response.ok) throw new Error('http_error');
          return response.json();
        }).then(function (json) {
          window.clearTimeout(timer);
          return json;
        }, function (error) {
          window.clearTimeout(timer);
          throw error;
        });
      });
    }

    function sendEnrichPayload(payload) {
      var config = window.INTAKE_CONFIG || {};
      var body = Object.assign({
        op: 'enrich',
        client_marker: config.clientMarker || '',
        form_started_at: state.form_started_at
      }, payload);

      if (config.mode === 'dryrun') {
        return new Promise(function (resolve) {
          window.setTimeout(function () {
            resolve({ ok: true, enriched: Object.keys(payload).filter(function (k) {
              return k !== 'lead_id';
            }) });
          }, DRYRUN_DELAY_MS);
        });
      }
      return postIntakeJson(body).then(function (json) {
        return {
          ok: !!(json && json.ok === true && json.lead_id === payload.lead_id),
          enriched: json && Array.isArray(json.enriched) ? json.enriched : []
        };
      }).catch(function () { return { ok: false, enriched: [] }; });
    }

    var continueBusy = false;

    function continueButton() {
      return form.querySelector('[data-continue]');
    }

    function setContinueBusy(busy) {
      var btn = continueButton();
      continueBusy = busy;
      if (!btn) return;
      btn.disabled = busy;
      btn.setAttribute('aria-busy', busy ? 'true' : 'false');
      btn.textContent = busy ? 'שולח...' : 'שלח';
    }

    function continueNow() {
      if (continueBusy || persistInFlight) return;

      userInteracted = true;
      if (!validateContact()) return;

      if (leadCreated) {
        if (phase === 'contact') revealQuestion('damage_type');
        return;
      }

      beginMeasurementSubmitAttempt();
      setContinueBusy(true);
      runAutosave();
    }

    function validateContact() {
      var firstInvalid = null;
      ['full_name', 'phone_raw', 'email', 'property_city'].forEach(function (id) {
        var input = form.querySelector('#' + id);
        if (!input) return;
        if (id === 'email' && input.value.trim() === '') return;
        if (!validateTextField(input) && !firstInvalid) firstInvalid = input;
      });
      if (firstInvalid) {
        window.setTimeout(function () { firstInvalid.focus(); }, 0);
        return false;
      }
      return true;
    }

    function questionSection(name) {
      return form.querySelector('.intake-q[data-step="' + name + '"]');
    }

    function revealQuestion(name) {
      var section = questionSection(name);
      if (!section) return;
      phase = name;
      section.hidden = false;
      measure('intake_step_view', { intake_step_id: name });

      var escape = document.querySelector('[data-escape]');
      if (escape) escape.hidden = false;

      var legend = section.querySelector('.intake-q__legend');
      if (legend) legend.focus();

      if (section.scrollIntoView) {
        var reduce = window.matchMedia &&
                     window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
          section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
        } catch (e) {
          section.scrollIntoView();
        }
      }
    }

    function setQuestionStatus(name, text) {
      var el = form.querySelector('[data-q-status="' + name + '"]');
      if (!el) return;
      el.hidden = !text;
      el.textContent = text || '';
    }

    function setQuestionRetry(name, visible) {
      var btn = form.querySelector('[data-q-retry="' + name + '"]');
      if (btn) btn.hidden = !visible;
    }

    function saveAnswer(name, value, isRevision) {
      if (enrichInFlightFor === name) return;
      enrichInFlightFor = name;
      enrichSeq += 1;
      var seq = enrichSeq;

      state[name] = value;
      setQuestionRetry(name, false);
      setQuestionStatus(name, QUESTION_SAVING);

      var payload = { lead_id: state.lead_id };
      payload[name] = value;

      sendEnrichPayload(payload).then(function (result) {
        if (seq !== enrichSeq) return;          // a newer choice supersedes this
        enrichInFlightFor = '';

        var confirmed = result.ok && result.enriched.indexOf(name) !== -1;
        if (!confirmed) {
          setQuestionStatus(name, QUESTION_FAILED);
          setQuestionRetry(name, true);
          if (!isRevision) {
            window.setTimeout(function () {
              if (state[name] === value && phase === name) saveAnswer(name, value, true);
            }, RETRY_DELAY_MS);
          }
          return;
        }

        setQuestionStatus(name, '');
        setQuestionRetry(name, false);
        measure('intake_step_complete', { intake_step_id: name });
        ui(name === 'damage_type' ? 'damage_type_saved' : 'case_status_saved', value.toLowerCase());
        collapseQuestion(name, value);

        var next = QUESTIONS[QUESTIONS.indexOf(name) + 1];
        if (next && !state[next]) {
          revealQuestion(next);
        } else if (!next) {
          ui('qualification_completed', 'check');
          showCompletion();
        } else {
          if (state.case_state) showCompletion();
          else revealQuestion(next);
        }
      });
    }

    function collapseQuestion(name, value) {
      var section = questionSection(name);
      if (section) section.hidden = true;

      var list = document.querySelector('[data-answers]');
      if (!list) return;
      list.hidden = false;

      var id = 'answer-' + name;
      var item = list.querySelector('#' + id);
      if (!item) {
        item = document.createElement('li');
        item.className = 'intake-answer';
        item.id = id;
        list.appendChild(item);
      }
      var label = form.querySelector('#' + name + '_' + value + ' ~ .intake-option__label');
      item.textContent = '';

      var title = document.createElement('span');
      title.className = 'intake-answer__title';
      title.textContent = QUESTION_TITLES[name] + ': ';
      var chosen = document.createElement('span');
      chosen.className = 'intake-answer__value';
      chosen.textContent = label ? label.textContent : value;
      var change = document.createElement('button');
      change.type = 'button';
      change.className = 'intake-link-btn intake-answer__change';
      change.textContent = 'שינוי';
      change.setAttribute('aria-label', 'שינוי ' + QUESTION_TITLES[name]);
      change.addEventListener('click', function () {
        var completion = document.querySelector('[data-intake-success]');
        if (completion) completion.hidden = true;
        form.hidden = false;
        item.remove();
        if (!list.querySelector('.intake-answer')) list.hidden = true;
        revealQuestion(name);
      });

      item.appendChild(title);
      item.appendChild(chosen);
      item.appendChild(document.createTextNode(' '));
      item.appendChild(change);
    }

    function bindQuestions() {
      QUESTIONS.forEach(function (name) {
        var section = questionSection(name);
        if (!section) return;
        section.addEventListener('change', function (e) {
          var t = e.target;
          if (t.name !== name || !t.checked) return;
          saveAnswer(name, t.value, !!state[name] && state[name] !== t.value);
        });
        var retry = form.querySelector('[data-q-retry="' + name + '"]');
        if (retry) {
          retry.addEventListener('click', function () {
            var checked = section.querySelector('input[name="' + name + '"]:checked');
            if (checked) saveAnswer(name, checked.value, true);
          });
        }
      });
    }

    function showCompletion() {
      phase = 'done';
      try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
      form.hidden = true;
      showSuccessState();
    }

    function bindEvents() {
      form.addEventListener('change', function (e) {
        var t = e.target;
        if (!t.name || t.name === 'website') return;
        markIntakeStarted();

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
        if (t.type !== 'radio') { userInteracted = true; }
      });

      form.addEventListener('input', function (e) {
        var t = e.target;
        if (!t.name || t.name === 'website') return;
        if (t.type === 'radio') return;
        markIntakeStarted();
        state[t.name] = t.value;
        userInteracted = true;
        if (t.getAttribute('aria-invalid') === 'true') {
          if (t.id === 'short_description') validateShortDescription();
          else validateTextField(t);
        }
        saveState();
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        continueNow();
      });

      form.querySelectorAll('[data-action="retry-submit"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          hideSubmitError();
          if (!validateStep()) return;
          beginMeasurementSubmitAttempt();
          runAutosave();
        });
      });

      ['full_name', 'phone_raw', 'email', 'property_city'].forEach(function (id) {
        var input = form.querySelector('#' + id);
        if (!input) return;
        input.addEventListener('blur', function () {
          if (input.value.trim() !== '') validateTextField(input);
        });
      });

      bindQuestions();

      if (window.TAVIV_CONTACT && typeof window.TAVIV_CONTACT.whatsappUrl === 'function') {
        var waUrl = window.TAVIV_CONTACT.whatsappUrl();
        document.querySelectorAll('[data-wa-link]').forEach(function (a) {
          a.setAttribute('href', waUrl);
          a.addEventListener('click', function () { ui('whatsapp_click', 'escape'); });
        });
      }
    }

    function showSuccessState() {
      var success = document.querySelector('[data-intake-success]');
      var wa = success.querySelector('[data-continue-whatsapp]');
      if (wa && window.TAVIV_CONTACT) {
        wa.setAttribute('href', window.TAVIV_CONTACT.continuationUrl(state.public_handoff_code));
        wa.setAttribute('target', '_blank');
      }
      form.hidden = true;
      success.hidden = false;
      success.focus();
    }

    function bindSuccessActions() {
      var success = document.querySelector('[data-intake-success]');
      if (!success) return;

      var wa = success.querySelector('[data-continue-whatsapp]');
      if (wa) {
        wa.addEventListener('click', function () {
          if (window.ATTRIBUTION && typeof window.ATTRIBUTION.recordUiEvent === 'function') {
            window.ATTRIBUTION.recordUiEvent('post_save_whatsapp_clicked', 'check', 'check');
          }
        });
      }

      var callback = success.querySelector('[data-continue-callback]');
      var note = success.querySelector('[data-callback-note]');
      if (callback && note) {
        callback.addEventListener('click', function () {
          callback.hidden = true;
          note.hidden = false;
          note.focus && note.focus();
          if (window.ATTRIBUTION && typeof window.ATTRIBUTION.recordUiEvent === 'function') {
            window.ATTRIBUTION.recordUiEvent('callback_request', 'post_save', 'check');
          }
        });
      }

      var toggle = success.querySelector('[data-details-toggle]');
      var details = success.querySelector('[data-details]');
      if (toggle && details) {
        toggle.addEventListener('click', function () {
          details.hidden = false;
          toggle.setAttribute('aria-expanded', 'true');
          toggle.hidden = true;
          var field = details.querySelector('#short_description');
          if (field) field.focus();
        });
      }

      var save = success.querySelector('[data-details-save]');
      if (save && details) {
        save.addEventListener('click', function () { sendEnrichment(save, details); });
      }
    }

    var enrichInFlight = false;

    function sendEnrichment(button, details) {
      if (enrichInFlight) return;
      var field = details.querySelector('#short_description');
      var status = details.querySelector('[data-details-status]');
      var value = (field && field.value.trim()) || '';
      if (!value) return;

      if (codePointLength(value) > SHORT_DESCRIPTION_MAX) {
        status.hidden = false;
        status.textContent = MESSAGES.short_description.tooLong;
        return;
      }

      var config = window.INTAKE_CONFIG || {};
      enrichInFlight = true;
      button.disabled = true;
      status.hidden = false;
      status.textContent = 'שומרים…';

      var done = function (ok) {
        enrichInFlight = false;
        button.disabled = false;
        status.textContent = ok
          ? 'התיאור נשמר.'
          : 'לא הצלחנו לשמור את התיאור, אבל הפרטים שלכם כבר אצלנו. אפשר לספר לנו בשיחה.';
        if (ok) { field.readOnly = true; button.hidden = true; }
      };

      if (config.mode === 'dryrun' || config.mode === 'prelaunch') {
        window.setTimeout(function () { done(true); }, DRYRUN_DELAY_MS);
        return;
      }
      sendEnrichPayload({ lead_id: state.lead_id, short_description: value }).then(function (result) {
        done(result.ok && result.enriched.indexOf('short_description') !== -1);
      });
    }

    function hideSubmitError() {
      var el = form.querySelector('[data-submit-error]');
      if (el) el.hidden = true;
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
        full_name: contactValues().full_name,
        phone_raw: contactValues().phone_raw,
        email: emailIsSendable(contactValues().email) ? contactValues().email : '',
        property_city: contactValues().property_city,
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

    function sendLead(payload) {
      return postIntakeJson(payload || buildPayload());
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
    }

    loadState();
    if (!state.lead_id || !LEAD_ID_PATTERN.test(state.lead_id)) {
      state.lead_id = newLeadId();
      state.lead_saved = false;
    }
    if (!state.form_started_at) state.form_started_at = new Date().toISOString();
    restoreUIFromState();
    bindEvents();
    bindSuccessActions();
    saveState();

    var contact = window.TAVIV_CONTACT;
    var canPersist = !!contact && contact.leadPersistenceAvailable() &&
      LEAD_ID_PATTERN.test(state.lead_id);

    if (contact) {
      var waFallback = fallback.querySelector('[data-fallback-whatsapp]');
      if (waFallback) { waFallback.setAttribute('href', contact.whatsappUrl()); }
    }

    if (!canPersist) {
      var title = fallback.querySelector('.intake-fallback__title');
      var body = fallback.querySelector('.intake-fallback__body');
      if (title) { title.textContent = 'אפשר ליצור קשר ישירות'; }
      if (body) { body.textContent = 'הטופס אינו פעיל כרגע. אפשר לכתוב בוואטסאפ או להתקשר, ונמשיך משם.'; }
      fallback.hidden = false;
      app.hidden = true;
      return;
    }

    fallback.hidden = true;
    app.hidden = false;
    measure('intake_view', {});
    measure('intake_step_view', { intake_step_id: 'contact' });
    if (state.lead_saved) restoreSavedLead();
  } catch (err) {
    console.error('Intake failed to initialize:', err);
  }
})();
