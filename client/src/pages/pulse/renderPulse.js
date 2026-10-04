// Renders the founder's Pulse page from GET /api/admin/pulse into a container.
// Plain string templating (ported from the claude.ai artifact it replaces):
// every value from the API goes through esc() before it reaches innerHTML.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(0)}%`);
const ago = (iso) => {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—');
const STALE_CHECK_MS = 15 * 60_000;

function spark(values, color = 'var(--accent)') {
  const v = values.length ? values : [0];
  const max = Math.max(1, ...v);
  const w = 120, h = 34, pad = 3;
  const x = (i) => (v.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (v.length - 1));
  const y = (n) => h - pad - (n / max) * (h - pad * 2);
  const line = v.map((n, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
  const area = `${line} L${x(v.length - 1).toFixed(1)},${h - pad} L${x(0).toFixed(1)},${h - pad} Z`;
  const last = v.length - 1;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <line x1="${pad}" x2="${w - pad}" y1="${h - pad}" y2="${h - pad}" stroke="var(--line)" stroke-width="1" />
    <path d="${area}" fill="${color}" fill-opacity="0.12" stroke="none" />
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
    <circle cx="${x(last).toFixed(1)}" cy="${y(v[last]).toFixed(1)}" r="2.4" fill="${color}" />
  </svg>`;
}

const pill = (text, tone = '') => `<span class="pill ${tone}">${esc(text)}</span>`;
const tile = (label, pillHtml, bigHtml, subHtml, extra = '') =>
  `<div class="tile"><div class="tile-head"><span class="label">${label}</span>${pillHtml || ''}</div>
    <div class="big num">${bigHtml}</div><div class="sub">${subHtml}</div>${extra}</div>`;
const rows = (pairs, emptyText) => (pairs.length
  ? `<div>${pairs.map(([k, v]) => `<div class="row"><span class="k">${k}</span><span class="v num">${v}</span></div>`).join('')}</div>`
  : `<div class="empty">${emptyText}</div>`);

// One bar per hour for the last 24 hours: green = every check passed,
// red = at least one failed, grey = no check recorded.
function hourBars(hourly) {
  const byHour = new Map((hourly || []).map(h => [new Date(h.hour).getTime(), h]));
  const thisHour = new Date(); thisHour.setMinutes(0, 0, 0);
  return `<div class="checks" aria-label="Last 24 hours of 5-minute checks">${Array.from({ length: 24 }, (_, i) => {
    const t = thisHour.getTime() - (23 - i) * 3600_000;
    const h = byHour.get(t);
    const label = `${new Date(t).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · ${h ? `${h.total - h.failed}/${h.total} ok` : 'no checks'}`;
    return `<i class="${h ? (h.failed ? 'bad' : '') : 'none'}" title="${esc(label)}"></i>`;
  }).join('')}</div>`;
}

export function renderPulse(root, { data: d, error, fetchedAt }) {
  if (!root) return;
  const shell = (verdict, tone, freshText, body = '') => `
    <header>
      <div class="topline">
        <span class="label">Pulse · founder only</span>
        <span class="fresh"><span class="dot ${tone}"></span><span>${esc(freshText)}</span>
          <button type="button" class="refresh" data-pulse-refresh>Refresh</button></span>
      </div>
      <div class="verdict">${verdict}</div>
    </header>${body}`;

  if (!d) {
    root.innerHTML = error
      ? shell('Could not load the numbers.', 'bad', `Request failed: ${error}`)
      : shell('Loading the latest numbers…', '', 'Loading');
    return;
  }

  // ── Status ──────────────────────────────────────────────────────────────
  const hb = d.heartbeat && !d.heartbeat.error ? d.heartbeat : null;
  const lastCheck = hb?.last;
  const checkStale = !lastCheck || Date.now() - new Date(lastCheck.at).getTime() > STALE_CHECK_MS;
  const checkFailed = lastCheck && !lastCheck.ok && !checkStale;
  const monitor = d.uptime?.monitors?.[0];
  const monitorDown = monitor && ['down', 'seems down'].includes(monitor.status);
  const dbDown = d.health && d.health.ok === false;
  const skipped = d.health?.aiModelsSkipped || [];
  const state = error || dbDown || monitorDown || checkFailed ? 'bad' : (skipped.length || checkStale ? 'warn' : 'good');

  const vis = d.visitors;
  const visitorsToday = vis && !vis.error ? vis.today : null;
  const newToday = d.signUps?.today ?? 0;
  const inq = d.inquiries?.last24h ?? 0;
  const statusPhrase = state === 'bad'
    ? (error ? 'The app is <em>not answering</em>' : dbDown ? 'The database is <em>down</em>' : checkFailed ? 'The last health check <em>failed</em>' : 'The app is <em>down</em>')
    : state === 'warn' ? (checkStale ? 'Health checks are <em>not running</em>' : 'Running, with <em>an AI model skipped</em>') : 'All systems up';
  const bits = [
    visitorsToday == null ? null : `${visitorsToday === 0 ? 'no' : fmt(visitorsToday)} real visitor${visitorsToday === 1 ? '' : 's'} today`,
    `${newToday === 0 ? 'no' : fmt(newToday)} new sign-up${newToday === 1 ? '' : 's'}`,
    inq ? `${inq} new ${inq === 1 ? 'inquiry' : 'inquiries'}` : null,
  ].filter(Boolean);
  const fresh = `Loaded ${ago(fetchedAt)}${error ? ` · refresh failed: ${error}` : ''}`;

  // ── Strip ───────────────────────────────────────────────────────────────
  const appTone = state === 'bad' ? 'bad' : state === 'warn' ? 'warn' : 'good';
  const appBig = monitor?.uptime7d != null
    ? `${monitor.uptime7d.toFixed(2)}<small>% up · 7d</small>`
    : hb?.uptime24h != null ? `${hb.uptime24h.toFixed(hb.uptime24h === 100 ? 0 : 2)}<small>% of checks ok · 24h</small>` : '—';
  const appSub = [
    hb?.publicMs24h ? `${hb.publicMs24h} ms public` : `DB ${d.health?.dbMs ?? '—'} ms`,
    lastCheck ? `checked ${ago(lastCheck.at)}` : 'no checks yet',
    d.health?.commit ? `build ${esc(d.health.commit)}` : null,
    d.health?.startedAt ? `restarted ${ago(d.health.startedAt)}` : null,
  ].filter(Boolean).join(' · ');

  const visTile = !vis
    ? tile('Real visitors', pill('not set up'), '—', 'Connect Cloudflare Web Analytics to count people, not bots.')
    : vis.error
      ? tile('Real visitors', pill('error', 'warn'), '—', esc(vis.error))
      : tile('Real visitors', pill(`${fmt(vis.last30)} · 30d`), `${fmt(vis.today)}<small>today</small>`, `${fmt(vis.last7)} in the last 7 days`, spark((vis.daily || []).slice(-14).map(x => x.visits)));

  const su = d.signUps || {};
  const suTile = tile('Sign-ups', pill(`${fmt(su.allTime)} all time`, su.today ? 'good' : ''),
    `${fmt(su.today)}<small>today</small>`,
    `${fmt(su.last7)} this week · ${fmt(su.last30)} in 30 days · ${fmt(d.activeLast7)} active`,
    spark((su.daily || []).slice(-14).map(x => x.n), 'var(--mint)'));

  const iq = d.inquiries || {};
  const latestInq = iq.latest?.[0];
  const inqTile = tile('Inquiries', pill(`${fmt(iq.last7)} · 7d`, iq.last24h ? 'good' : ''),
    `${fmt(iq.last24h)}<small>last 24 h</small>`,
    latestInq ? `Latest: ${esc(latestInq.label)} · ${ago(latestInq.at)}` : 'Nothing to support@ or hello@ yet.');

  const strip = `<section class="strip">${
    tile('The app', pill(state === 'bad' ? 'down' : state === 'warn' ? 'attention' : 'up', appTone), appBig, appSub, hourBars(hb?.hourly))
  }${visTile}${suTile}${inqTile}</section>`;

  // ── Gate ────────────────────────────────────────────────────────────────
  const g = d.gate || {};
  const f = d.funnel || {};
  const bar = (now, target) => `<div class="bar"><i style="width:${Math.min(100, target ? (now / target) * 100 : 0).toFixed(1)}%"></i></div>`;
  const gate = `<section class="gate">
    <div class="countdown">
      <span class="label">Kill or continue</span>
      <span class="days num">${fmt(g.daysLeft)}</span>
      <p>days until ${shortDate(g.date)}. Counting people who arrived since ${shortDate(g.since)}.</p>
    </div>
    <div class="targets">
      <div class="target"><span class="name">Stranger sign-ins</span>${bar(g.signInsNow || 0, g.signIns)}<span class="val num">${fmt(g.signInsNow)} / ${fmt(g.signIns)}</span></div>
      <div class="target"><span class="name">Back after 7 days</span>${bar(g.d7RateNow || 0, g.d7Rate)}<span class="val num">${pct(g.d7RateNow)} / ${pct(g.d7Rate)}</span></div>
      <div class="target"><span class="name">Paying customers</span>${bar(g.payingNow || 0, g.paying)}<span class="val num">${fmt(g.payingNow)} / ${fmt(g.paying)}</span></div>
      <div class="funnel">
        ${vis && !vis.error ? `<span class="step"><b>${fmt(vis.last30)}</b> visitors · 30d</span><span class="arrow">→</span>` : ''}
        <span class="step"><b>${fmt(f.signedUp)}</b> signed up</span><span class="arrow">→</span>
        <span class="step"><b>${fmt(f.onboarded)}</b> onboarded</span><span class="arrow">→</span>
        <span class="step"><b>${fmt(f.threeTasks)}</b> 3+ tasks</span><span class="arrow">→</span>
        <span class="step"><b>${fmt(f.backAfter7)}</b> of ${fmt(f.backAfter7Eligible)} back after 7 days</span><span class="arrow">→</span>
        <span class="step"><b>${fmt(f.paying)}</b> paying</span>
      </div>
    </div>
  </section>`;

  // ── Panels ──────────────────────────────────────────────────────────────
  const people = su.latest || [];
  const peoplePanel = `<div class="panel span-2"><h2>Latest people ${pill(`${fmt(people.length)} shown`)}</h2>${people.length ? `
    <div class="table-wrap"><table>
      <thead><tr><th>Who</th><th>Signed up</th><th>Onboarded</th><th>Tasks</th><th>Last seen</th><th>Plan</th></tr></thead>
      <tbody>${people.map(p => `<tr><td class="m">${esc(p.who)}</td><td>${shortDate(p.at)}</td><td>${p.onboarded ? 'yes' : 'no'}</td><td class="m num">${fmt(p.tasks)}</td><td>${ago(p.lastSeen)}</td><td>${p.paying ? pill('pro', 'good') : 'free'}</td></tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty">No strangers yet.</div>'}</div>`;

  const visPanel = !vis || vis.error
    ? `<div class="panel"><h2>Where visitors come from</h2><div class="hint">${!vis
        ? 'Needs <code>CF_API_TOKEN</code>, <code>CF_ACCOUNT_ID</code> and <code>CF_WEB_ANALYTICS_SITE_TAG</code> on Railway.'
        : `Cloudflare answered: ${esc(vis.error)}`}</div></div>`
    : `<div class="panel"><h2>Where visitors come from ${pill('7 days')}</h2>
        ${rows((vis.referrers || []).map(r => [esc(r.host), fmt(r.visits)]), 'No visits this week.')}
        <span class="label">Top pages</span>
        ${rows((vis.pages || []).slice(0, 5).map(r => [esc(r.path), fmt(r.views)]), '—')}
        <span class="label">Countries</span>
        ${rows((vis.countries || []).slice(0, 5).map(r => [esc(r.country), fmt(r.visits)]), '—')}
      </div>`;

  const m = d.money || {};
  const moneyPanel = `<div class="panel"><h2>Money ${pill(m.paying ? `${m.paying} paying` : 'no sales yet', m.paying ? 'good' : '')}</h2>
    ${rows([
      ['MRR (gross, list prices)', `$${(m.mrrUsd ?? 0).toFixed(2)}`],
      ['Monthly · Yearly · Founder', `${fmt(m.byPlan?.monthly)} · ${fmt(m.byPlan?.yearly)} · ${fmt(m.byPlan?.founder)}`],
      ['Founder seats left', m.founderSeatsLeft == null ? '—' : `${fmt(m.founderSeatsLeft)} of ${fmt(m.founderCap)}`],
      ['Set to cancel', fmt(m.canceling)],
    ], '')}</div>`;

  const ai = d.ai || {};
  const spendTone = (ai.estSpendThisMonthUsd || 0) >= (ai.spendReviewAtUsd || 10) ? 'warn' : '';
  const aiPanel = `<div class="panel"><h2>AI ${skipped.length ? pill(`${skipped.length} model skipped`, 'warn') : pill('all models ok', 'good')}</h2>
    ${spark((ai.daily || []).map(x => x.actions))}
    ${rows([
      ['Actions this month', fmt(ai.actionsThisMonth)],
      ['Est. OpenAI spend', `<span class="${spendTone}">$${(ai.estSpendThisMonthUsd ?? 0).toFixed(2)}</span> / review at $${ai.spendReviewAtUsd ?? 10}`],
      ...skipped.map(s => [`Skipped: ${esc(s.model)}`, `until ${new Date(s.until).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`]),
    ], '')}</div>`;

  const er = d.errors || {};
  const errCount = (er.server?.last24h || 0) + (er.client?.last24h || 0);
  const relTone = monitorDown || checkFailed ? 'bad' : errCount > 0 ? 'warn' : 'good';
  const relPill = monitorDown || checkFailed ? 'down now' : errCount > 0 ? `${errCount} error${errCount === 1 ? '' : 's'} · 24 h` : 'quiet';
  const relPanel = `<div class="panel"><h2>Reliability ${pill(relPill, relTone)}</h2>
    ${hb ? rows([
      ['Self-checks ok · 24 h / 7 d / 30 d', `${hb.uptime24h ?? '—'}% / ${hb.uptime7d ?? '—'}% / ${hb.uptime30d ?? '—'}%`],
      ['Last check', lastCheck ? `${lastCheck.ok ? 'ok' : 'failed'} · ${ago(lastCheck.at)}` : 'none yet'],
      ['Last failure', hb.lastFailure ? `${shortDate(hb.lastFailure.at)} · ${esc(hb.lastFailure.problem || '')}` : 'none recorded'],
    ], '') : `<div class="hint">Self-checks unavailable${d.heartbeat?.error ? `: ${esc(d.heartbeat.error)}` : ''}.</div>`}
    ${monitor
      ? rows([
          ['UptimeRobot 24 h · 7 d · 30 d', `${monitor.uptime24h ?? '—'}% · ${monitor.uptime7d ?? '—'}% · ${monitor.uptime30d ?? '—'}%`],
          ['Last outage (outside view)', monitor.lastDown ? `${shortDate(monitor.lastDown)} (${ago(monitor.lastDown)})` : 'none recorded'],
        ], '')
      : '<div class="hint">The server checks itself every 5 min and mails you on failure, but it can\'t report its own crash. For that, add a free UptimeRobot monitor on <code>cleartable.app/api/health</code> (optional: <code>UPTIMEROBOT_API_KEY</code> on Railway shows its numbers here).</div>'}
    ${rows([
      ['Server 500s · 24 h / 7 d', `${fmt(er.server?.last24h)} / ${fmt(er.server?.last7)}`],
      ['App crashes · 24 h / 7 d', `${fmt(er.client?.last24h)} / ${fmt(er.client?.last7)}`],
    ], '')}
    ${(er.top || []).length ? `<span class="label">Most frequent this week</span>${rows(er.top.map(t => [esc(t.label), `${fmt(t.n)}×`]), '')}` : ''}
  </div>`;

  const footer = `<footer>
    <span>Live from <span class="mono">/api/admin/pulse</span> · reloads every minute</span>
    <span>Self-check every 5 min: database + public URL</span>
    <span>Your own accounts are excluded</span>
  </footer>`;

  root.innerHTML = shell(`${statusPhrase} · ${bits.join(' · ')}.`, state, fresh,
    `${strip}${gate}<section class="grid">${peoplePanel}${visPanel}${moneyPanel}${aiPanel}${relPanel}</section>${footer}`);
}
