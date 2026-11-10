/* Line icons shared by the hero building and the assistant. 24px grid, stroke only. */
(function () {
  'use strict';

  var P = {
    // damage types
    roof:     '<path d="M3 11.5 12 4l9 7.5"/><path d="M12 12.5s2.6 2.8 2.6 4.8a2.6 2.6 0 0 1-5.2 0c0-2 2.6-4.8 2.6-4.8z"/>',
    pipe:     '<path d="M4 8h8a4 4 0 0 1 4 4v1"/><path d="M4 12h6"/><path d="M13.5 13h5v2.5h-5z"/><path d="M16 18.5v2"/>',
    ceiling:  '<path d="M3 5h18"/><path d="M7 5v3"/><path d="M12 9s3 3.3 3 5.6a3 3 0 0 1-6 0C9 12.3 12 9 12 9z"/><path d="M18 5v2"/>',
    fire:     '<path d="M12 3c.9 3.1 4.5 4.9 4.5 9.3a4.5 4.5 0 0 1-9 0c0-1.9.9-3.3 2-4.2.1 1.3.8 2.2 1.7 2.2.3-2.5-.2-4.900.8-7.300z"/>',
    crack:    '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M13 4l-3 5 4 3-3 4 2 4"/>',
    lock:     '<rect x="5.500" y="11" width="13" height="9" rx="1.500"/><path d="M8.500 11V8a3.500 3.500 0 0 1 6.800-1.200"/><path d="M12 14.500v2"/>',
    shop:     '<path d="M4 10l1.500-5h13L20 10"/><path d="M5 10v9h14v-9"/><path d="M10 19v-5h4v5"/><path d="M4 10h16"/>',
    building: '<path d="M6 20V5h12v15"/><path d="M4 20h16"/><path d="M9.500 9h1M13.500 9h1M9.500 13h1M13.500 13h1"/><path d="M11 20v-3h2v3"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.600 9.600a2.500 2.500 0 1 1 3.500 2.300c-.700.400-1.100.900-1.100 1.800"/><path d="M12 16.800v.1"/>',
    // steps and states
    camera:   '<path d="M4 8h3l1.500-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.200" r="3.200"/>',
    doc:      '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12h5M10 16h5"/>',
    stop:     '<circle cx="12" cy="12" r="9"/><path d="M5.700 5.700l12.600 12.600"/>',
    message:  '<path d="M4 5h16v11H10l-5 4v-4H4z"/><path d="M8 9.500h8M8 12.500h5"/>',
    list:     '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.500 6h.1M4.500 12h.1M4.500 18h.1"/>',
    clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.200 2"/>',
    shield:   '<path d="M12 3l7 2.500v5.500c0 4.500-3 8-7 10-4-2-7-5.500-7-10V5.500z"/><path d="M9 12l2.200 2.200L15.200 10"/>',
    people:   '<circle cx="9" cy="8.500" r="3"/><path d="M3.500 19c.500-3.200 2.700-5 5.500-5s5 1.800 5.500 5"/><circle cx="17" cy="9.500" r="2.300"/><path d="M16.500 14.200c2.200.200 3.700 1.800 4 4.300"/>',
    check:    '<circle cx="12" cy="12" r="9"/><path d="M8.200 12.400l2.600 2.600 5-5.400"/>',
    repeat:   '<path d="M19 12a7 7 0 1 1-2.300-5.200"/><path d="M19 4.500V9h-4.500"/>',
    scale:    '<path d="M12 4v16"/><path d="M7.500 20h9"/><path d="M5.500 7h13"/><path d="M5.500 7l-2.500 6a2.500 2.500 0 0 0 5 0z"/><path d="M18.500 7l-2.500 6a2.500 2.500 0 0 0 5 0z"/>',
    bulb:     '<path d="M9.500 18h5M10.500 21h3"/><path d="M12 3a6 6 0 0 0-3.500 10.900c.600.500 1 1.200 1 2.100h5c0-.900.400-1.600 1-2.100A6 6 0 0 0 12 3z"/>',
    search:   '<circle cx="11" cy="11" r="6"/><path d="M15.500 15.500l4.500 4.500"/>',
    // interface
    close:    '<path d="M6 6l12 12M18 6 6 18"/>',
    arrow:    '<path d="M15 5l-7 7 7 7"/>',
    tick:     '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
    alert:    '<path d="M12 4 21 19H3z"/><path d="M12 10v4.500"/><path d="M12 17v.1"/>',
    whatsapp: '<path d="M4 20l1.300-4.200A8 8 0 1 1 8.300 19z"/><path d="M9 9.500c0 3 2.500 5.500 5.500 5.500l1-1.500-1.700-1-0.800.800c-1-.500-1.800-1.300-2.300-2.300l.800-.800-1-1.700z"/>'
  };


  // The Taviv mark, drawn as vectors so the dial can animate while the assistant works.
  var logoN = 0;
  window.TAVIV_LOGO = function (cls) {
    logoN += 1;
    return '<svg class="tlogo" viewBox="28 8 140 136" width="140" height="136" aria-hidden="true" focusable="false"><defs><linearGradient id="tlg__ID__" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F1F3F4"/><stop offset="1" stop-color="#8E959B"/></linearGradient></defs><g fill="none" stroke="url(#tlg__ID__)" stroke-linecap="round" stroke-linejoin="round"><path class="tl-ring" d="M115.77 32.03 A47 47 0 1 1 64.5 100.07" stroke-width="6.5"/><path class="tl-scan" d="M115.77 32.03 A47 47 0 1 1 64.5 100.07" stroke-width="6.5"/><path d="M61 103 L45 131" stroke-width="10" stroke-linecap="butt"/><path d="M77 87 L106 58 L136 87" stroke-width="6"/><g class="tl-ticks" stroke-width="4.5" stroke-linecap="butt"><line class="tl-tick" style="--i:0" x1="59.05" y1="87.98" x2="50.25" y2="89.85"/><line class="tl-tick" style="--i:1" x1="58.03" y1="76.32" x2="49.03" y2="76.01"/><line class="tl-tick" style="--i:2" x1="59.86" y1="64.77" x2="51.21" y2="62.29"/><line class="tl-tick" style="--i:3" x1="64.43" y1="54.0" x2="56.64" y2="49.5"/><line class="tl-tick" style="--i:4" x1="71.47" y1="44.66" x2="65.0" y2="38.4"/><line class="tl-tick" style="--i:5" x1="80.56" y1="37.29" x2="75.79" y2="29.66"/><line class="tl-tick" style="--i:6" x1="91.17" y1="32.35" x2="88.39" y2="23.79"/></g></g><line class="tl-needle" x1="106.0" y1="37.0" x2="106.0" y2="17.0" stroke-width="5.5" stroke-linecap="round"/><g class="tl-win"><rect x="99" y="82" width="6.5" height="6.5" style="--i:0"/><rect x="107" y="82" width="6.5" height="6.5" style="--i:1"/><rect x="99" y="90" width="6.5" height="6.5" style="--i:3"/><rect x="107" y="90" width="6.5" height="6.5" style="--i:2"/></g></svg>'
      .replace(/__ID__/g, String(logoN))
      .replace('class="tlogo"', 'class="tlogo' + (cls ? ' ' + cls : '') + '"');
  };

  window.TAVIV_ICON = function (name, cls) {
    var body = P[name] || P.question;
    return '<svg class="ti' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" width="24" height="24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false">' + body + '</svg>';
  };
}());
