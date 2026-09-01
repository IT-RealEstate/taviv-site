(function () {
  'use strict';

  document.documentElement.classList.add('js-ready');

  var header = document.querySelector('[data-header]');
  if (header) {
    var ticking = false;

    var updateHeader = function () {
      header.classList.toggle('is-compact', window.scrollY > 80);
      ticking = false;
    };

    updateHeader();

    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(updateHeader);
        ticking = true;
      }
    }, { passive: true });
  }

  var menuBtn = document.querySelector('[data-menu-toggle]');
  var menuPanel = document.querySelector('[data-menu]');

  if (menuBtn && menuPanel) {
    var withinHeader = function (node) {
      while (node && node.nodeType === 1) {
        if (node.classList && node.classList.contains('site-header')) { return true; }
        node = node.parentNode;
      }
      return false;
    };

    var setMenu = function (open, returnFocus) {
      menuPanel.hidden = !open;
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.classList.toggle('menu-open', open);
      if (open) {
        var first = menuPanel.querySelector('a');
        if (first) { first.focus(); }
      } else if (returnFocus) {
        menuBtn.focus();
      }
    };

    menuBtn.addEventListener('click', function () {
      setMenu(menuBtn.getAttribute('aria-expanded') !== 'true', true);
    });

    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && !menuPanel.hidden) {
        setMenu(false, true);
      }
    });

    menuPanel.addEventListener('click', function (e) {
      var node = e.target;
      while (node && node !== menuPanel) {
        if (node.tagName === 'A') { setMenu(false, false); return; }
        node = node.parentNode;
      }
    });

    document.addEventListener('click', function (e) {
      if (!menuPanel.hidden && !withinHeader(e.target)) {
        setMenu(false, false);
      }
    });

    document.addEventListener('focusin', function (e) {
      if (!menuPanel.hidden && !withinHeader(e.target)) {
        setMenu(false, false);
      }
    });
  }

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReducedMotion && 'IntersectionObserver' in window) {
    var revealTargets = document.querySelectorAll('[data-reveal]');
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.25 });

    Array.prototype.forEach.call(revealTargets, function (el) {
      observer.observe(el);
    });
  } else {
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-reveal]'),
      function (el) {
        el.classList.add('is-revealed');
      }
    );
  }

  var serviceCards = document.querySelectorAll('[data-service]');
  var router = document.querySelector('[data-router]');

  if (serviceCards.length || router) {
    var SVC_KEY = 'svc_ui_v1';
    var attribution = window.ATTRIBUTION;

    var focusRevealed = function (el) {
      if (!el) { return; }
      if (!el.hasAttribute('tabindex')) { el.setAttribute('tabindex', '-1'); }
      try { el.focus({ preventScroll: false }); } catch (e) { el.focus(); }
    };

    var loadSvcState = function () {
      var parsed = null;
      try {
        var raw = sessionStorage.getItem(SVC_KEY);
        parsed = raw ? JSON.parse(raw) : null;
      } catch (e) {
        parsed = null;
      }
      var arr = function (v) {
        return Object.prototype.toString.call(v) === '[object Array]' ? v : [];
      };
      var str = function (v) { return typeof v === 'string' ? v : ''; };
      return {
        body: arr(parsed && parsed.body),
        price: arr(parsed && parsed.price),
        q1: str(parsed && parsed.q1),
        q2: str(parsed && parsed.q2)
      };
    };

    var svcState = loadSvcState();

    var saveSvcState = function () {
      try {
        sessionStorage.setItem(SVC_KEY, JSON.stringify(svcState));
      } catch (e) {
      }
    };

    var setMember = function (list, id, on) {
      var i = list.indexOf(id);
      if (on && i === -1) { list.push(id); }
      if (!on && i !== -1) { list.splice(i, 1); }
    };

    var logSvc = function (eventName, id) {
      if (attribution && typeof attribution.recordServiceEvent === 'function') {
        attribution.recordServiceEvent(eventName, id);
      }
    };

    var cards = {};

    Array.prototype.forEach.call(serviceCards, function (card) {
      var id = card.getAttribute('data-service');
      var toggle = card.querySelector('[data-svc-toggle]');
      var body = card.querySelector('[data-svc-body]');
      var reveal = card.querySelector('[data-svc-reveal]');
      var price = card.querySelector('[data-svc-price]');
      var cta = card.querySelector('[data-service-interest]');
      if (!id || !body) { return; }

      var openBody = function (record) {
        body.hidden = false;
        if (toggle) {
          toggle.setAttribute('aria-expanded', 'true');
          toggle.hidden = true;
        }
        setMember(svcState.body, id, true);
        saveSvcState();
        if (record) {
          logSvc('service_details_open', id);
          focusRevealed(body);
        }
      };

      var openPrice = function (record) {
        if (!reveal || !price) { return; }
        price.hidden = false;
        reveal.setAttribute('aria-expanded', 'true');
        reveal.hidden = true;
        setMember(svcState.price, id, true);
        saveSvcState();
        if (record) {
          logSvc('service_price_reveal', id);
          focusRevealed(price);
        }
      };

      if (toggle) {
        toggle.addEventListener('click', function () { openBody(true); });
      }

      if (reveal && price) {
        reveal.addEventListener('click', function () { openPrice(true); });
      }

      if (cta) {
        cta.addEventListener('click', function () {
          logSvc('service_cta_click', id);
        });
      }

      cards[id] = { openBody: openBody, openPrice: openPrice, hasToggle: !!toggle };

      if (svcState.price.indexOf(id) !== -1) {
        if (toggle) { openBody(false); }
        openPrice(false);
      } else if (toggle && svcState.body.indexOf(id) !== -1) {
        openBody(false);
      }
    });

    if (router) {
      var qBlocks = {};
      Array.prototype.forEach.call(router.querySelectorAll('[data-router-q]'), function (el) {
        qBlocks[el.getAttribute('data-router-q')] = el;
      });
      var routeBlocks = router.querySelectorAll('[data-route]');
      var intro = router.querySelectorAll('[data-router-intro]');
      var answered = router.querySelector('[data-router-answered]');
      var summary = router.querySelector('[data-router-summary]');
      var resetBtn = router.querySelector('[data-router-reset]');
      var feasToggle = router.querySelector('[data-feas-toggle]');
      var feasPanel = router.querySelector('[data-feas]');
      var closeCta = document.querySelector('[data-close-cta]');

      var labelFor = function (name, value) {
        var input = router.querySelector('input[name="' + name + '"][value="' + value + '"]');
        var label = input && input.parentNode.querySelector('.rt__opt-label');
        return label ? label.textContent.trim() : '';
      };

      var routeFor = function () {
        if (svcState.q1 === 'yes') { return 'insurer_gap'; }
        if (svcState.q1 === 'no' && svcState.q2) { return svcState.q2; }
        return '';
      };

      var render = function () {
        var active = routeFor();
        var showQ2 = svcState.q1 === 'no' && !svcState.q2;
        var anyAnswer = !!svcState.q1;

        qBlocks.q1.hidden = anyAnswer;
        if (qBlocks.q2) { qBlocks.q2.hidden = !showQ2; }

        Array.prototype.forEach.call(intro, function (el) { el.hidden = anyAnswer; });

        Array.prototype.forEach.call(routeBlocks, function (el) {
          el.hidden = el.getAttribute('data-route') !== active;
        });

        if (closeCta) { closeCta.hidden = active === 'unsure'; }

        if (answered && summary) {
          answered.hidden = !anyAnswer;
          var parts = [];
          if (svcState.q1) { parts.push(labelFor('rt-q1', svcState.q1)); }
          if (svcState.q2) { parts.push(labelFor('rt-q2', svcState.q2)); }
          summary.textContent = parts.join(' · ');
        }
      };

      Array.prototype.forEach.call(router.querySelectorAll('[data-router-input]'), function (input) {
        input.addEventListener('change', function () {
          if (!input.checked) { return; }
          if (input.name === 'rt-q1') {
            svcState.q1 = input.value;
            svcState.q2 = '';
            Array.prototype.forEach.call(
              router.querySelectorAll('input[name="rt-q2"]'),
              function (o) { o.checked = false; }
            );
          } else {
            svcState.q2 = input.value;
          }
          saveSvcState();
          render();
        });
      });

      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          svcState.q1 = '';
          svcState.q2 = '';
          Array.prototype.forEach.call(
            router.querySelectorAll('[data-router-input]'),
            function (o) { o.checked = false; }
          );
          saveSvcState();
          render();
          var first = qBlocks.q1.querySelector('input');
          if (first) { first.focus(); }
        });
      }

      if (feasToggle && feasPanel) {
        var openFeas = function (record) {
          feasPanel.hidden = false;
          feasToggle.setAttribute('aria-expanded', 'true');
          feasToggle.hidden = true;
          setMember(svcState.body, 'remote_feasibility', true);
          saveSvcState();
          if (record) {
            logSvc('service_details_open', 'remote_feasibility');
            focusRevealed(feasPanel);
          }
        };

        feasToggle.addEventListener('click', function () { openFeas(true); });

        if (svcState.body.indexOf('remote_feasibility') !== -1 ||
            svcState.price.indexOf('remote_feasibility') !== -1) {
          openFeas(false);
        }
      }

      render();
    }
  }

})();
