(function () {
  'use strict';

  var link = document.querySelector('.s1-hero__media');
  if (!link) { return; }
  var video = link.querySelector('.s1-hero__video');
  if (!video || !video.canPlayType) { return; }

  var wideEnough = window.matchMedia('(min-width: 900px)').matches;
  var wantsStill = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  if (!wideEnough || wantsStill || saveData) { return; }

  function addSource(src, type) {
    var source = document.createElement('source');
    source.src = src;
    source.type = type;
    video.appendChild(source);
  }

  var started = false;
  function start() {
    if (started) { return; }
    started = true;
    addSource('assets/media/building-loop.webm', 'video/webm');
    addSource('assets/media/building-loop.mp4', 'video/mp4');
    video.preload = 'auto';
    video.autoplay = true;
    video.muted = true;
    video.load();
    var played = video.play();
    if (played && played.catch) {
      played.catch(function () {
        document.addEventListener('pointerdown', function once() {
          document.removeEventListener('pointerdown', once);
          var retry = video.play();
          if (retry && retry.catch) { retry.catch(function () {}); }
        });
      });
    }
  }

  if (document.readyState === 'complete') {
    start();
  } else {
    window.addEventListener('load', start, { once: true });
    window.setTimeout(start, 2500);
  }
}());
