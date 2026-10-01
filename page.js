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
  // Each city's media sit in a tray in the band below the map, one tray visible at a time,
  // so photos, captions and city labels can never overlap one another.
  var sets = Array.prototype.slice.call(cxEl.querySelectorAll('.cx-set')).map(function (el) {
    return {
      el: el, stop: parseInt(el.dataset.stop, 10),
      tiles: Array.prototype.slice.call(el.querySelectorAll('.cx-tile')).map(function (t) {
        return { el: t, vid: t.querySelector('video'), playing: false };
      })
    };
  });
  var leadLine = cxEl.querySelector('.cx-lead');
  var stageEl = cxEl.querySelector('.cx-stage');
  var stopsLi = Array.prototype.slice.call(cxEl.querySelectorAll('.cx-stops > li'));
  var EUROPE = [false, true, true, true, true, true, false, false, false, false];

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
    var ax = 0.5, ay = small.matches ? 0.5 : 0.48;
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
    var lit = 0, current = -1;
    for (var c = 0; c < cities.length; c++) {
      var C = cities[c];
      var ig = reduce ? 1 : smooth((p - arrive[c]) / 0.025);
      var swell = (!reduce && c === N) ? smooth((p - R1 - 0.02) / 0.14) : 0;
      C.el.style.setProperty('--ig', ig.toFixed(3));
      C.el.style.setProperty('--swell', swell.toFixed(3));
      C.sx = tx + C.x * s; C.sy = ty + C.y * s;
      C.el.style.transform = 'translate3d(' + C.sx.toFixed(1) + 'px,' + C.sy.toFixed(1) + 'px,0)';
      if (reduce || p >= arrive[c]) { lit++; current = c; }
    }
    cxEl.__lit = lit;
    for (var l = 0; l < stopsLi.length; l++) stopsLi[l].classList.toggle('on', l === Math.max(current, 0));

    // the tray: the current city's media land in the band, one tray at a time
    if (reduce) return;
    var stR = stageEl.getBoundingClientRect();
    var shown = null;
    sets.forEach(function (S) {
      var gi = S.stop;
      var inA = smooth((p - arrive[gi]) / 0.03);
      var out = gi < N ? smooth((p - (arrive[gi + 1] - 0.022)) / 0.018) : 0;   // gives way just before the next city lands
      var vis = Math.min(inA, 1 - out);
      S.el.style.opacity = vis > 0.001 ? '1' : '0';
      S.el.style.pointerEvents = 'none';
      if (vis > 0.5) shown = S;
      for (var j = 0; j < S.tiles.length; j++) {
        var T = S.tiles[j];
        var land = smooth((p - arrive[gi] - j * 0.01) / 0.03) * (1 - out);
        T.el.style.opacity = land.toFixed(3);
        T.el.style.transform = 'scale(' + (0.94 + land * 0.06).toFixed(4) + ')';
        if (T.vid) {
          var want = land > 0.5 && act.live;
          if (want && !T.playing) { T.playing = true; var pr = T.vid.play(); if (pr && pr.catch) pr.catch(function () {}); }
          else if (!want && T.playing) { T.playing = false; T.vid.pause(); }
        }
      }
    });
    // a thin leader from the lit pin down to its tray
    if (shown && shown.tiles.length) {
      var C2 = cities[shown.stop], t0 = shown.tiles[0].el.getBoundingClientRect();
      var vr = view.getBoundingClientRect();
      var x0 = vr.left - stR.left + C2.sx, y0 = vr.top - stR.top + C2.sy + 6;
      var x1 = t0.left - stR.left + Math.min(24, t0.width / 2), y1 = t0.top - stR.top - 4;
      var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
      leadLine.style.height = len.toFixed(1) + 'px';
      leadLine.style.transform = 'translate3d(' + x0.toFixed(1) + 'px,' + y0.toFixed(1) + 'px,0) rotate(' + (Math.atan2(dy, dx) - Math.PI / 2).toFixed(4) + 'rad)';
      leadLine.style.opacity = (y1 > y0 + 8) ? '0.7' : '0';
    } else {
      leadLine.style.opacity = '0';
    }
  }

  /* ------------------------------------------------------------- carousel */
  (function () {
    var root = document.querySelector('.cr');
    if (!root) return;
    var track = root.querySelector('.cr-track');
    var slides = Array.prototype.slice.call(track.children);
    var now = root.querySelector('[data-cr-now]');
    root.querySelector('[data-cr-total]').textContent = slides.length;
    var prev = root.querySelector('[data-cr="prev"]'), next = root.querySelector('[data-cr="next"]');
    var play = root.querySelector('[data-cr="play"]');
    var behavior = reduce ? 'auto' : 'smooth';
    function index() {
      var x = track.scrollLeft, best = 0, d = Infinity;
      for (var i = 0; i < slides.length; i++) {
        var dd = Math.abs(slides[i].offsetLeft - track.offsetLeft - x);
        if (dd < d) { d = dd; best = i; }
      }
      return best;
    }
    function atEnd() { return track.scrollLeft + track.clientWidth >= track.scrollWidth - 4; }
    // `cur` is the slide we are heading to; it is only re-read from the scroll position once a
    // scroll has settled, so rapid presses never read a half-finished smooth scroll.
    var cur = 0, moving = false, settleT = 0;
    function go(i) {
      i = (i + slides.length) % slides.length;
      cur = i; moving = true; render();
      track.scrollTo({ left: slides[i].offsetLeft - track.offsetLeft, behavior: behavior });
    }
    function render() { now.textContent = cur + 1; slides.forEach(function (s, k) { s.classList.toggle('is-now', k === cur); }); }
    function sync() {
      var at = index(), end = atEnd();
      if (end && moving && cur > at) { /* tail slides share the last scroll position; keep the target */ }
      else cur = end ? slides.length - 1 : at;
      moving = false; render();
    }
    function fwd() { go(cur >= slides.length - 1 ? 0 : cur + 1); }
    function back() { go(cur <= 0 ? slides.length - 1 : cur - 1); }
    prev.addEventListener('click', function () { back(); hold(); });
    next.addEventListener('click', function () { fwd(); hold(); });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); fwd(); hold(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); hold(); }
      else if (e.key === 'Home') { e.preventDefault(); go(0); hold(); }
      else if (e.key === 'End') { e.preventDefault(); go(slides.length - 1); hold(); }
    });
    var raf = 0;
    track.addEventListener('scroll', function () { clearTimeout(settleT); settleT = setTimeout(sync, 140); }, { passive: true });
    // gentle autoplay: off under reduced motion, paused on hover, focus, touch, offscreen, or by the button
    var paused = reduce, hovering = false, focused = false, visible = false, timer = 0;
    function setPaused(v) { paused = v; play.setAttribute('aria-pressed', v ? 'true' : 'false'); play.setAttribute('aria-label', v ? 'Play slideshow' : 'Pause slideshow'); }
    setPaused(paused);
    play.addEventListener('click', function () { setPaused(!paused); });
    function hold() { clearInterval(timer); timer = setInterval(tick, 5000); }
    function tick() { if (paused || hovering || focused || !visible || document.hidden) return; fwd(); }
    root.addEventListener('pointerenter', function () { hovering = true; });
    root.addEventListener('pointerleave', function () { hovering = false; });
    root.addEventListener('focusin', function () { focused = true; });
    root.addEventListener('focusout', function () { focused = false; });
    track.addEventListener('touchstart', function () { hovering = true; }, { passive: true });
    track.addEventListener('touchend', function () { setTimeout(function () { hovering = false; }, 4000); }, { passive: true });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }, { threshold: 0.4 }).observe(track);
    }
    hold(); sync();
  })();

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
    var lit = cxEl.__lit || 0;
    cxEl.querySelector('.cx-stage').setAttribute('data-sc-verify-state',
      lit + '|' + Math.round(cam.x) + ',' + Math.round(cam.y) + ',' + Math.round(cam.vis));
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
  addEventListener('resize', function () { layoutMap(); drawCircuit(cxAct, true); }, { passive: true });
  Array.prototype.forEach.call(cxEl.querySelectorAll('.cx-photo img'), function (im) {
    if (!im.complete) im.addEventListener('load', function () { layoutMap(); }, { once: true });
  });

  var lastY = -1;
  function frameTick() {
    drawHero();
    var near = cxAct && (cxAct.live || reduce);
    if (near) drawCircuit(cxAct, Math.abs(scrollY - lastY) > innerHeight * 1.5);
    if (near) verifyState(cxAct);
    drawIndex();
    lastY = scrollY;
    requestAnimationFrame(frameTick);
  }
  drawCircuit(cxAct, true);
  requestAnimationFrame(frameTick);
})();
