// Builds the documents the "Cleartable Pulse" artifact reads, from one call to
// GET /api/internal/pulse. Writes JSON files that are then stored in the
// artifact's database (pulse/latest, pulse/lastGood, pulse/checks):
//
//   node --env-file=.env scripts/pulse-snapshot.mjs --out <dir> [--prev-checks <checks.json>]
//
// latest.json    — this check: { checkedAt, ok, httpStatus, ms, error? }
// lastGood.json  — only written when the check succeeded: { checkedAt, data }
// checks.json    — rolling list of the last 168 checks (7 days hourly),
//                  merged with --prev-checks when given
//
// A failed call (app down, timeout, 5xx) still produces latest + checks, so the
// page can say "not answering" while showing the last good numbers.
import fs from 'node:fs';
import path from 'node:path';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};
const out = arg('--out');
if (!out) {
  console.error('Usage: pulse-snapshot.mjs --out <dir> [--prev-checks <file>]');
  process.exit(1);
}
const url = process.env.PULSE_URL || 'https://cleartable.app/api/internal/pulse';
const token = process.env.PULSE_TOKEN;
if (!token) {
  console.error('PULSE_TOKEN is not set.');
  process.exit(1);
}

const checkedAt = new Date().toISOString();
const t0 = Date.now();
let latest;
let data = null;
try {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  const ms = Date.now() - t0;
  if (r.ok) {
    data = await r.json();
    latest = { checkedAt, ok: true, httpStatus: r.status, ms };
  } else {
    latest = { checkedAt, ok: false, httpStatus: r.status, ms, error: `HTTP ${r.status}` };
  }
} catch (err) {
  latest = { checkedAt, ok: false, httpStatus: null, ms: Date.now() - t0, error: err.name === 'TimeoutError' ? 'timed out after 20 s' : err.message };
}

let prev = [];
const prevPath = arg('--prev-checks');
if (prevPath && fs.existsSync(prevPath)) {
  try {
    const doc = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
    const body = doc.data && Array.isArray(doc.data.list) ? doc.data : doc;
    prev = Array.isArray(body.list) ? body.list : [];
  } catch { /* start a fresh history */ }
}
const list = [...prev, { at: checkedAt, ok: latest.ok, ms: latest.ms }].slice(-168);

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify(latest));
fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify({ list }));
if (data) fs.writeFileSync(path.join(out, 'lastGood.json'), JSON.stringify({ checkedAt, data }));
else fs.rmSync(path.join(out, 'lastGood.json'), { force: true });

console.log(`${latest.ok ? 'ok' : 'FAILED'} · ${latest.httpStatus ?? '-'} · ${latest.ms} ms · ${list.length} checks kept${data ? '' : ' · lastGood unchanged'}`);
