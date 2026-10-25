/* Cleartable — the hero's looping demo (speak → sorted by AI → Plan my day).
   Plays only while on screen and the tab is visible; with reduced motion (or
   no JS) the markup's resting state, the sorted list, stays put. */
(function () {
  var stage = document.getElementById('hero-loop');
  if (!stage) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var q = function (s) { return stage.querySelector(s); };
  var qa = function (s) { return Array.prototype.slice.call(stage.querySelectorAll(s)); };
  var capture = q('.loop-capture');
  var wave = q('.loop-wave');
  var transcript = q('.loop-transcript');
  var cursor = q('.loop-cursor');
  var speak = q('.loop-speak');
  var send = q('.loop-send');
  var plan = q('.loop-plan');
  var tasks = qa('.loop-tasks li');
  var blocks = qa('.loop-event.block');
  var WORDS = "Call the dentist today… Anna's sending the budget on Friday… and I need to finish the Q4 deck for work.".split(' ');

  for (var i = 0; i < 40; i++) {
    var bar = document.createElement('i');
    bar.style.setProperty('--i', i);
    bar.style.setProperty('--h', (0.25 + 0.75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6))).toFixed(2));
    wave.appendChild(bar);
  }

  var run = 0;          // bumps on every stop, so a sleeping timeline knows it's stale
  var playing = false;
  var onScreen = false;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function pointAt(el) {
    var s = stage.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    cursor.style.setProperty('--x', (r.left - s.left + r.width * 0.6) + 'px');
    cursor.style.setProperty('--y', (r.top - s.top + r.height * 0.55) + 'px');
  }

  function press(el) {
    el.classList.add('press');
    setTimeout(function () { el.classList.remove('press'); }, 160);
  }

  function reset() {
    stage.classList.add('animated');
    stage.dataset.scene = 'capture';
    capture.classList.remove('listening');
    speak.classList.remove('on');
    transcript.innerHTML = '';
    tasks.concat(blocks, [plan]).forEach(function (el) { el.classList.remove('in'); });
    cursor.style.setProperty('--x', (stage.clientWidth - 60) + 'px');
    cursor.style.setProperty('--y', (stage.clientHeight - 40) + 'px');
  }

  async function loop(id) {
    var live = function () { return id === run; };
    while (live()) {
      reset();
      stage.classList.remove('fade');
      await sleep(700); if (!live()) return;
      pointAt(speak);
      await sleep(800); if (!live()) return;
      press(speak); speak.classList.add('on'); capture.classList.add('listening');
      await sleep(400);
      for (var w = 0; w < WORDS.length; w++) {
        if (!live()) return;
        var span = document.createElement('span');
        span.className = 'w';
        span.textContent = WORDS[w] + ' ';
        transcript.appendChild(span);
        void span.offsetWidth;
        span.classList.add('in');
        await sleep(/…$/.test(WORDS[w]) ? 420 : 150);
      }
      pointAt(send);
      await sleep(800); if (!live()) return;
      press(send); capture.classList.remove('listening'); speak.classList.remove('on');
      await sleep(350); if (!live()) return;
      stage.dataset.scene = 'sorted';
      for (var t = 0; t < tasks.length; t++) {
        await sleep(t ? 320 : 450); if (!live()) return;
        tasks[t].classList.add('in');
      }
      await sleep(450); if (!live()) return;
      plan.classList.add('in');
      await sleep(400); if (!live()) return;
      pointAt(plan);
      await sleep(900); if (!live()) return;
      press(plan);
      await sleep(350); if (!live()) return;
      stage.dataset.scene = 'day';
      for (var b = 0; b < blocks.length; b++) {
        await sleep(b ? 450 : 600); if (!live()) return;
        blocks[b].classList.add('in');
      }
      cursor.style.setProperty('--x', (stage.clientWidth - 60) + 'px');
      cursor.style.setProperty('--y', (stage.clientHeight - 40) + 'px');
      await sleep(2600); if (!live()) return;
      stage.classList.add('fade');
      await sleep(500);
    }
  }

  function update() {
    var should = onScreen && !document.hidden;
    if (should && !playing) { playing = true; loop(++run); }
    else if (!should && playing) { playing = false; run++; }
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      update();
    }, { threshold: 0.35 }).observe(stage);
  } else {
    onScreen = true;
  }
  document.addEventListener('visibilitychange', update);
  update();
})();
