/* Page-local choreography for Marti Pla Rabell. The engine is untouched; this
   file reads act progress from the engine's own act records and drives:
   1. the hero planes (different rates + fine-pointer lean),
   2. the circuit flight (the signature move),
   3. the yacht iris, and
   4. the object index (visited objects stay lit). */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(hover: hover) and (pointer: fine)');
  var small = matchMedia('(max-width: 860px)');
  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var c01 = function (x) { return clamp(x, 0, 1); };
  var smooth = function (x) { x = c01(x); return x * x * (3 - 2 * x); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  // Reduced motion: no pinned travel at all. The hero and the circuit become
  // ordinary sections, so there is no scroll that changes nothing.
  if (reduce) {
    document.documentElement.classList.add('rm');
    Array.prototype.forEach.call(document.querySelectorAll('[data-rm-flow]'), function (s) {
      s.setAttribute('data-sc-act', 'flow');
    });
  }

  var api = ScrollCraft.mount(document.body);
  var actOf = function (id) {
    for (var i = 0; i < api.acts.length; i++) if (api.acts[i].el.id === id) return api.acts[i];
    return null;
  };

  /* ---------------------------------------------------------------- hero */
  var hero = document.getElementById('marti');
  var H = {
    sky: hero.querySelector('.hx-sky'), lights: hero.querySelector('.hx-lights'),
    name: hero.querySelector('.hx-name'), subject: hero.querySelector('.hx-subject'),
    fg: hero.querySelector('.hx-fg')
  };
  var ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', function (e) {
    if (!fine.matches || reduce) return;
    ptr.tx = (e.clientX / innerWidth) * 2 - 1;
    ptr.ty = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  function drawHero() {
    if (reduce) return;
    var t = smooth(scrollY / (innerHeight * 0.85));
    if (t >= 1 && hero.__done) return;
    hero.__done = t >= 1;
    ptr.x = lerp(ptr.x, ptr.tx, 0.08); ptr.y = lerp(ptr.y, ptr.ty, 0.08);
    var px = ptr.x, py = ptr.y;
    // back planes lag, front planes lead. Copy rides at 1x (it does not move).
    H.sky.style.transform = 'translate3d(' + (px * -6).toFixed(1) + 'px,' + (t * -36 + py * -4).toFixed(1) + 'px,0) scale(' + (1.06 - t * 0.03).toFixed(4) + ')';
    H.lights.style.transform = 'translate3d(' + (px * -12).toFixed(1) + 'px,' + (t * -170 + py * -6).toFixed(1) + 'px,0) scale(' + (1 + t * 0.08).toFixed(4) + ')';
    H.name.style.transform = 'translate3d(' + (px * -4).toFixed(1) + 'px,' + (t * -90).toFixed(1) + 'px,0)';
    H.subject.style.transform = 'translate3d(' + (px * 10).toFixed(1) + 'px,' + (t * -24).toFixed(1) + 'px,0) scale(' + (1 + t * 0.07).toFixed(4) + ')';
    H.fg.style.transform = 'translate3d(' + (px * 26).toFixed(1) + 'px,' + (t * -380 + py * 10).toFixed(1) + 'px,0) scale(' + (1 + t * 0.35).toFixed(4) + ')';
  }

  /* ------------------------------------------------------------- circuit */
  var cxEl = document.getElementById('circuit');
  var view = cxEl.querySelector('.cx-view');
  var map = cxEl.querySelector('.cx-map');
  var legs = Array.prototype.slice.call(cxEl.querySelectorAll('.cx-route'));
  var cities = Array.prototype.slice.call(cxEl.querySelectorAll('.cx-city')).map(function (el) {
    return { el: el, x: parseFloat(el.dataset.x), y: parseFloat(el.dataset.y) };
  });
  var photos = Array.prototype.slice.call(cxEl.querySelectorAll('.cx-photo')).map(function (el) {
    return { el: el, stop: parseInt(el.dataset.stop, 10), vid: el.querySelector('video'), playing: false };
  });
  // Each city's photos form a group: the lead lands at an anchor beside the pin and the
  // rest fan out from it; once the route moves on, the group gathers into a small pile.
  //   a: which corner of the lead sits at the anchor, d: anchor offset from the pin in
  //   photo-widths, dir: which way the fan opens.
  var GROUPS = [
    { a: [0, 1], d: [0.12, -0.12], dir: 1 },   // Buenos Aires
    { a: [1, 0], d: [-0.12, 0.14], dir: -1 },  // Madrid
    { a: [0, 0], d: [0.12, 0.14], dir: 1 },    // Barcelona
    { a: [1, 1], d: [-0.12, -0.12], dir: -1 }, // Amsterdam
    { a: [0, 1], d: [0.12, -0.12], dir: 1 },   // Vilnius
    { a: [0, 0], d: [0.12, 0.16], dir: 1 },    // Istanbul
    { a: [1, 1], d: [-0.12, -0.1], dir: -1 },  // Bangkok
    { a: [0, 0], d: [0.14, 0.12], dir: 1 },    // Singapore
    { a: [0, 0.5], d: [0.16, 0], dir: 1 },     // Hong Kong
    { a: [1, 1], d: [-0.12, -0.12], dir: -1 }  // Dubai
  ];
  photos.forEach(function (ph) {
    var g = GROUPS[ph.stop]; g.items = g.items || []; ph.k = g.items.length; g.items.push(ph);
  });
  var panelEl = cxEl.querySelector('.cx-panel');
  var stopsLi = Array.prototype.slice.call(cxEl.querySelectorAll('.cx-stops > li'));
  var tallyCities = cxEl.querySelector('[data-tally="cities"]');
  var tallyNamed = cxEl.querySelector('[data-tally="named"]');
  var tallyHosted = cxEl.querySelector('[data-tally="hosted"]');
  var NAMED = [1, 0, 1, 1, 0, 1, 2, 1, 3, 1];       // named conferences per stop, 11 in all
  var HOSTED = [0, 1, 0, 0, 0, 0, 0, 1, 1, 1];      // cities where the team hosted or sponsored
  var EUROPE = [false, true, true, true, true, true, false, false, false, false];
  var HOME = 2;                                      // Barcelona

  legs.forEach(function (p) {
    p.__len = p.getTotalLength();
    p.style.strokeDasharray = p.__len + ' ' + p.__len;
    p.style.strokeDashoffset = p.__len;
  });

  // Timeline, in act progress. 0 to R0 is authored silence (see BRIEF.md).
  var R0 = 0.11, R1 = 0.83, N = legs.length, SEG = (R1 - R0) / N, DRAW = 0.62;
  var arrive = [R0 - 0.015];
  for (var k = 1; k <= N; k++) arrive.push(R0 + (k - 1) * SEG + DRAW * SEG);

  var cam = { x: 590, y: 185, vis: 760, init: false };
  var SMAX = 1;     // the map is laid out at its largest scale and only ever scaled down, so it stays sharp

  function layoutMap() {
    var w = view.clientWidth;
    var minVis = small.matches ? 170 : 430;
    SMAX = Math.max(w / minVis, 1);
    map.style.width = (1000 * SMAX) + 'px';
    map.style.height = (370 * SMAX) + 'px';
    photos.forEach(function (ph) { ph.w = ph.el.offsetWidth; ph.h = ph.el.offsetHeight; });
    var W0 = photos.length ? photos[0].el.offsetWidth : 192;
    GROUPS.forEach(function (g) { g.W = W0; });
  }

  function visFor(i) {
    if (small.matches) return EUROPE[i] ? 200 : 260;
    return EUROPE[i] ? 470 : 560;
  }

  function target(p) {
    // returns the camera target and the route state for progress p
    var head, vis, i, f;
    if (p < R0) {
      var s = smooth((p - 0.04) / (R0 - 0.04));
      var wide = small.matches ? { x: 585, y: 190, vis: 560 } : { x: 600, y: 178, vis: 820 };
      var start = cities[0];
      return { x: lerp(wide.x, start.x + 40, s), y: lerp(wide.y, start.y - 40, s), vis: lerp(wide.vis, visFor(0) + 120, s) };
    }
    for (i = 0; i < N; i++) {
      var a = R0 + i * SEG, b = a + DRAW * SEG;
      if (p < b) {
        f = smooth((p - a) / (b - a));
        var pt = legs[i].getPointAtLength(f * legs[i].__len);
        var A = cities[i], B = cities[i + 1];
        var dist = Math.hypot(B.x - A.x, B.y - A.y);
        var bump = Math.sin(Math.PI * f) * Math.min(dist / 260, 1) * (small.matches ? 90 : 160);
        vis = lerp(i === 0 ? visFor(0) + 120 : visFor(i), visFor(i + 1), f) + bump;
        return { x: pt.x, y: pt.y, vis: vis };
      }
      if (p < a + SEG) {
        var C = cities[i + 1];
        return { x: C.x, y: C.y, vis: visFor(i + 1) };
      }
    }
    var D = cities[N];
    var fin = smooth((p - R1) / (1 - R1));
    return { x: D.x, y: D.y, vis: lerp(visFor(N), visFor(N) * 0.78, fin) };
  }

  function drawCircuit(act, settle) {
    var p = reduce ? 1 : act.p;
    var w = view.clientWidth, h = view.clientHeight;
    var ax = small.matches ? 0.5 : 0.6, ay = small.matches ? 0.36 : 0.48;
    var T;
    if (reduce) {
      T = small.matches ? { x: 585, y: 175, vis: 520 } : { x: 585, y: 180, vis: 560 };
      ax = 0.5; ay = 0.5;
    } else {
      T = target(p);
    }
    if (!cam.init || settle || reduce) { cam.x = T.x; cam.y = T.y; cam.vis = T.vis; cam.init = true; }
    else { cam.x = lerp(cam.x, T.x, 0.25); cam.y = lerp(cam.y, T.y, 0.25); cam.vis = lerp(cam.vis, T.vis, 0.25); }
    var s = w / cam.vis;                     // screen px per map unit
    var tx = ax * w - cam.x * s, ty = ay * h - cam.y * s;
    map.style.transform = 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) scale(' + (s / SMAX).toFixed(5) + ')';

    // route legs
    for (var i = 0; i < N; i++) {
      var a = R0 + i * SEG, b = a + DRAW * SEG;
      var f = reduce ? 1 : smooth((p - a) / (b - a));
      legs[i].style.strokeDashoffset = (legs[i].__len * (1 - f)).toFixed(2);
    }

    // cities ignite as the head reaches them
    var lit = 0, named = 0, hosted = 0, current = -1;
    for (var c = 0; c < cities.length; c++) {
      var C = cities[c];
      var ig = reduce ? 1 : smooth((p - arrive[c]) / 0.025);
      if (c === HOME && !reduce) ig = Math.max(ig, 0.35);      // home base glows faintly from the start
      var swell = (!reduce && c === N) ? smooth((p - R1 - 0.02) / 0.14) : 0;
      C.el.style.setProperty('--ig', ig.toFixed(3));
      C.el.style.setProperty('--swell', swell.toFixed(3));
      C.sx = tx + C.x * s; C.sy = ty + C.y * s;
      C.el.style.transform = 'translate3d(' + C.sx.toFixed(1) + 'px,' + C.sy.toFixed(1) + 'px,0)';
      if (reduce || p >= arrive[c]) { lit++; named += NAMED[c]; hosted += HOSTED[c]; current = c; }
    }
    tallyCities.textContent = lit + '/10';
    tallyNamed.textContent = named + '/11';
    tallyHosted.textContent = hosted;
    for (var l = 0; l < stopsLi.length; l++) stopsLi[l].classList.toggle('on', l === Math.max(current, 0));

    // photos drop out of the sky onto their pin, fan open, then gather into a pile
    if (reduce) return;
    var limBottom = small.matches ? panelEl.offsetTop - 10 : h - 10;
    GROUPS.forEach(function (g, gi) {
      if (!g.items) return;
      var C = cities[gi];
      var later = gi < N ? smooth((p - arrive[gi + 1]) / 0.04) : 0;
      var isNow = current === gi && later < 0.5;
      // open layout relative to the pin, at full size
      var W = g.W, L = g.items[0];
      var x = g.d[0] * W - g.a[0] * L.w, y = g.d[1] * W - g.a[1] * L.h;
      var pos = [];
      for (var k = 0; k < g.items.length; k++) {
        var it = g.items[k];
        if (k > 0) {
          var prev = g.items[k - 1];
          x = g.dir > 0 ? x + prev.w * 0.62 : x - it.w * 0.62;
          y = pos[0].y + k * 0.14 * W;
        }
        pos.push({ x: x, y: y });
      }
      // keep an open fan on screen
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      pos.forEach(function (q, k) { var it = g.items[k];
        minX = Math.min(minX, C.sx + q.x); maxX = Math.max(maxX, C.sx + q.x + it.w);
        minY = Math.min(minY, C.sy + q.y); maxY = Math.max(maxY, C.sy + q.y + it.h); });
      var shx = 0, shy = 0;
      if (maxX > w - 10) shx = (w - 10) - maxX;
      if (minX + shx < 10) shx = 10 - minX;
      if (maxY > limBottom) shy = limBottom - maxY;
      if (minY + shy < 10) shy = 10 - minY;
      for (var j = 0; j < g.items.length; j++) {
        var ph = g.items[j], q = pos[j];
        var land = smooth((p - arrive[gi] - j * 0.012) / 0.03);
        var pileS = 0.5;
        var ox = lerp(q.x + shx, pos[0].x * pileS + j * g.dir * 7, later);
        var oy = lerp(q.y + shy, pos[0].y * pileS + j * 5, later);
        var sc = lerp(1, pileS, later) * (1.06 - land * 0.06);
        var rot = (j % 2 ? 2.5 : -2) * (1 - land * 0.5) + later * (j % 2 ? 4 : -3);
        var drop = (1 - land) * -46;
        ph.el.style.transformOrigin = '0 0';
        ph.el.style.transform = 'translate3d(' + (C.sx + ox).toFixed(1) + 'px,' + (C.sy + oy + drop).toFixed(1) + 'px,0) rotate(' + rot.toFixed(2) + 'deg) scale(' + sc.toFixed(4) + ')';
        ph.el.style.opacity = (land * (1 - later * 0.55)).toFixed(3);
        ph.el.classList.toggle('piled', later > 0.25);
        ph.el.style.zIndex = isNow ? String(100 - j) : String(gi * 4 + (4 - j));
        if (ph.vid) {
          var want = land > 0.5 && later < 0.5 && act.live;
          if (want && !ph.playing) { ph.playing = true; var pr = ph.vid.play(); if (pr && pr.catch) pr.catch(function () {}); }
          else if (!want && ph.playing) { ph.playing = false; ph.vid.pause(); }
        }
      }
    });
  }

  /* ------------------------------------------------------------- forbes */
  var fw = document.getElementById('forbes-wording');
  Array.prototype.forEach.call(document.querySelectorAll('[data-forbes]'), function (el) { if (fw) el.textContent = fw.textContent; });
  var flip = document.querySelector('.proof-flip');
  if (flip && !reduce && 'IntersectionObserver' in window) {
    var fio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        fio.disconnect();
        var pr = flip.play(); if (pr && pr.catch) pr.catch(function () {});
      });
    }, { threshold: 0.6 });
    fio.observe(flip);
  }

  /* ---------------------------------------------------------------- yacht */
  var yx = document.getElementById('yacht');
  var frame = yx.querySelector('.yx-frame');
  function drawYacht() {
    if (reduce) return;
    // The iris opens while the stage slides in, from Dubai's light into the night itself.
    var top = yx.getBoundingClientRect().top;
    var e = smooth(1 - top / innerHeight);
    if (top > innerHeight) e = 0;
    var r = lerp(3, 76, e);
    frame.style.clipPath = e >= 0.999 ? 'none' : 'circle(' + r.toFixed(2) + '% at 50% 50%)';
  }

  /* ---------------------------------------------------------------- index */
  var ixLinks = Array.prototype.slice.call(document.querySelectorAll('.ix ol a'));
  var ixTargets = ixLinks.map(function (a) { return document.getElementById(a.dataset.ix); });
  var seen = {};
  function drawIndex() {
    var y = scrollY + innerHeight * 0.45, here = 0;
    for (var i = 0; i < ixTargets.length; i++) if (ixTargets[i].offsetTop <= y) here = i;
    for (var j = 0; j < ixLinks.length; j++) {
      if (j <= here) seen[j] = true;
      ixLinks[j].classList.toggle('is-here', j === here);
      ixLinks[j].classList.toggle('is-seen', !!seen[j]);
      if (j === here) ixLinks[j].setAttribute('aria-current', 'true'); else ixLinks[j].removeAttribute('aria-current');
    }
  }

  // Published for the verification harness: the rendered circuit state, rounded.
  function verifyState(act) {
    var lit = tallyCities.textContent;
    cxEl.querySelector('.cx-stage').setAttribute('data-sc-verify-state',
      lit + '|' + Math.round(cam.x) + ',' + Math.round(cam.y) + ',' + Math.round(cam.vis));
  }

  /* ------------------------------------------- contact: plate pinned to home */
  var kx = document.getElementById('contact');
  var lead = kx.querySelector('.kx-lead'), plate = kx.querySelector('.kx-plate'), home = kx.querySelector('.kx-map i.home');
  function placeLead() {
    if (!lead || getComputedStyle(lead).display === 'none') return;
    var k = kx.getBoundingClientRect(), pr = plate.getBoundingClientRect(), h = home.getBoundingClientRect();
    var x0 = pr.right - k.left, y0 = pr.top - k.top + 28;
    var x1 = h.left + h.width / 2 - k.left, y1 = h.top + h.height / 2 - k.top;
    var len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
    lead.style.left = x0 + 'px'; lead.style.top = y0 + 'px'; lead.style.width = len + 'px';
    lead.style.transform = 'rotate(' + ang + 'rad)';
  }

  // Keyboard: a control inside a not-yet-revealed flow block must never take focus at opacity 0.
  document.addEventListener('focusin', function (e) {
    var blk = e.target.closest && e.target.closest('[data-sc-in]');
    if (!blk) return;
    var r = e.target.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight - 72) e.target.scrollIntoView({ block: 'center', behavior: 'instant' });
    blk.classList.add('sc-in');
    Array.prototype.forEach.call(blk.children, function (c) { c.classList.add('sc-in'); });
  });

  var cxAct = actOf('circuit');
  layoutMap();
  placeLead();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeLead);
  addEventListener('resize', function () { layoutMap(); drawCircuit(cxAct, true); placeLead(); }, { passive: true });
  Array.prototype.forEach.call(cxEl.querySelectorAll('.cx-photo img'), function (im) {
    if (!im.complete) im.addEventListener('load', function () { layoutMap(); }, { once: true });
  });

  var lastY = -1;
  function frameTick() {
    drawHero();
    var near = cxAct && (cxAct.live || reduce);
    if (near) drawCircuit(cxAct, Math.abs(scrollY - lastY) > innerHeight * 1.5);
    if (near) verifyState(cxAct);
    drawYacht();
    drawIndex();
    if (kx.getBoundingClientRect().top < innerHeight) placeLead();
    lastY = scrollY;
    requestAnimationFrame(frameTick);
  }
  drawCircuit(cxAct, true);
  requestAnimationFrame(frameTick);
})();
