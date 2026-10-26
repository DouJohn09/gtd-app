/* Cleartable — the "works with your AI" loop (ask an assistant → tasks land
   in Cleartable → Plan my week fills the weekend). Each round names a
   different assistant. Same rules as hero-loop.js: plays only while on screen
   and the tab is visible; with reduced motion (or no JS) the inbox scene stays. */
(function () {
  var stage = document.getElementById('mcp-loop');
  if (!stage) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var q = function (s) { return stage.querySelector(s); };
  var qa = function (s) { return Array.prototype.slice.call(stage.querySelectorAll(s)); };
  var wrap = document.getElementById('mcp-loop-wrap');
  var host = document.getElementById('mcp-loop-host');
  var steps = Array.prototype.slice.call(document.querySelectorAll('.mcp-steps li'));
  var names = qa('.chat-app-name');
  var typed = q('.chat-typed');
  var send = q('.chat-send');
  var ai = q('.chat-ai');
  var tool = q('.chat-tool');
  var reply = q('.chat-reply');
  var cursor = q('.loop-cursor');
  var plan = q('.loop-plan');
  var tasks = qa('.loop-tasks li');
  var blocks = qa('.loop-event.block');
  var APPS = [['ChatGPT', 'chatgpt.com', 'chatgpt'], ['Claude', 'claude.ai', 'claude'], ['Grok', 'grok.com', 'grok']];
  var TEXT = "Put these in Cleartable: book the car service, buy a gift for Mia's party on Saturday, and plan the hike with Tom.";

  var run = 0;          // bumps on every stop, so a sleeping timeline knows it's stale
  var round = 0;
  var playing = false;
  var onScreen = false;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function pointAt(el) {
    var s = stage.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    cursor.style.setProperty('--x', (r.left - s.left + r.width * 0.6) + 'px');
    cursor.style.setProperty('--y', (r.top - s.top + r.height * 0.55) + 'px');
  }
  function park() {
    cursor.style.setProperty('--x', (stage.clientWidth - 60) + 'px');
    cursor.style.setProperty('--y', (stage.clientHeight - 40) + 'px');
  }
  function press(el) {
    el.classList.add('press');
    setTimeout(function () { el.classList.remove('press'); }, 160);
  }

  // The window itself says where we are: the assistant's chat (neutral, its
  // address) or Cleartable (violet, cleartable.app); the steps below follow.
  function setScene(name) {
    stage.dataset.scene = name;
    wrap.dataset.where = name === 'chat' ? 'chat' : 'app';
    steps.forEach(function (li) { li.classList.toggle('on', li.dataset.step === name); });
  }

  function reset() {
    var app = APPS[round % APPS.length];
    host.textContent = app[1];
    wrap.dataset.app = app[2];
    names.forEach(function (n) { n.textContent = app[0]; });
    stage.classList.add('animated');
    setScene('chat');
    typed.textContent = '';
    tool.classList.remove('working');
    tasks.concat(blocks, [plan, ai, reply]).forEach(function (el) { el.classList.remove('in'); });
    park();
  }

  async function loop(id) {
    var live = function () { return id === run; };
    while (live()) {
      reset();
      stage.classList.remove('fade');
      await sleep(800); if (!live()) return;
      for (var c = 1; c <= TEXT.length; c++) {
        if (!live()) return;
        typed.textContent = TEXT.slice(0, c);
        await sleep(/[,:]/.test(TEXT[c - 1]) ? 200 : 28);
      }
      pointAt(send);
      await sleep(800); if (!live()) return;
      press(send);
      await sleep(400); if (!live()) return;
      ai.classList.add('in'); tool.classList.add('working');
      park();
      await sleep(1300); if (!live()) return;
      tool.classList.remove('working'); reply.classList.add('in');
      await sleep(1500); if (!live()) return;
      setScene('inbox');
      for (var t = 0; t < tasks.length; t++) {
        await sleep(t ? 320 : 500); if (!live()) return;
        tasks[t].classList.add('in');
      }
      await sleep(450); if (!live()) return;
      plan.classList.add('in');
      await sleep(400); if (!live()) return;
      pointAt(plan);
      await sleep(900); if (!live()) return;
      press(plan);
      await sleep(350); if (!live()) return;
      setScene('weekend');
      for (var b = 0; b < blocks.length; b++) {
        await sleep(b ? 450 : 600); if (!live()) return;
        blocks[b].classList.add('in');
      }
      park();
      await sleep(2800); if (!live()) return;
      stage.classList.add('fade');
      await sleep(500);
      round++;
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
