import OpenAI from 'openai';
import { captureError } from '../lib/observability.js';
import { sendEmail } from './email.js';

// The AI provider layer: clients, the per-task model chain, a circuit breaker
// per model, a model-availability watchdog, and founder alerts. services/ai.js
// builds prompts and calls complete(); nothing else talks to a provider.
//
// Why this exists (2026-09-21): Groq retired llama-3.3-70b overnight. Every
// call paid a wasted 404 round-trip before the fallback, nobody was told, and
// the OpenAI client had the SDK's 10-minute timeout, so a hung call would never
// have reached a fallback at all.

// maxRetries: 0 on both — the chain below is the retry policy. Per-request
// timeouts come from TASK_TIMEOUT_MS; the client value is only a ceiling.
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 90_000 })
  : null;
// Groq free tier stalls instead of failing when over its per-minute caps, so it
// keeps a short ceiling regardless of task.
const GROQ_TIMEOUT_MS = 15_000;
const groq = process.env.GROQ_API_KEY
  ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1', maxRetries: 0, timeout: GROQ_TIMEOUT_MS })
  : null;

const PROVIDERS = { openai, groq };

export function aiConfigured() {
  return Boolean(openai || groq);
}

// ─── Routing ────────────────────────────────────────────────────────────────
// Each task walks an ordered chain until one model returns valid JSON.
// Heavy tasks: gpt-4.1-mini (passed schema + ground-truth evals at 100%,
// 2026-07-27) → gpt-4o-mini (different model family, so one model's outage or
// retirement isn't the whole chain) → Groq. Groq is last everywhere: its free
// tier (8k tokens/min, 1k output tokens/min) can't finish planner-sized answers,
// and gpt-oss-20b failed 12/49 capture evals in JSON mode (2026-09-21).
//
// Override without a deploy: AI_ROUTING='{"plan-day":["openai:gpt-4o-mini","groq:openai/gpt-oss-20b"]}'
// (provider:model, first colon splits). GROQ_MODEL swaps the Groq model everywhere.
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const G = { provider: 'groq', model: GROQ_MODEL };
const MINI = { provider: 'openai', model: 'gpt-4.1-mini' };
const NANO = { provider: 'openai', model: 'gpt-4o-mini' };

const HEAVY = [MINI, NANO, G];
const LIGHT = [NANO, MINI, G];
const DEFAULT_ROUTING = {
  'smart-capture':     LIGHT,
  'url-extract':       LIGHT,
  'process-inbox':     HEAVY,
  'import-notes':      HEAVY,
  'find-duplicates':   HEAVY,
  'daily-priorities':  HEAVY,
  'plan-day':          HEAVY,
  'plan-week':         HEAVY,
  'analyze-task':      HEAVY,
  'project-breakdown': HEAVY,
  'weekly-review':     HEAVY,
};

function parseRoutingOverride(raw) {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    const out = {};
    for (const [task, list] of Object.entries(obj)) {
      if (!DEFAULT_ROUTING[task]) { console.warn(`[ai] AI_ROUTING: unknown task "${task}" ignored`); continue; }
      const chain = (Array.isArray(list) ? list : []).map((s) => {
        const i = String(s).indexOf(':');
        const provider = String(s).slice(0, i);
        const model = String(s).slice(i + 1);
        return i > 0 && model && provider in PROVIDERS ? { provider, model } : null;
      });
      if (!chain.length || chain.includes(null)) { console.warn(`[ai] AI_ROUTING: bad chain for "${task}" ignored`); continue; }
      out[task] = chain;
    }
    return out;
  } catch (err) {
    console.warn(`[ai] AI_ROUTING is not valid JSON, using defaults: ${err.message}`);
    return {};
  }
}

const ROUTING = { ...DEFAULT_ROUTING, ...parseRoutingOverride(process.env.AI_ROUTING) };

// Per-task sampling + output caps. Classification/extraction tasks run at
// temperature 0 — provider defaults (Groq: 1.0) made identical inputs classify
// differently between runs, which users read as "the AI is flaky". Advisory
// prose gets mild warmth. max_tokens is sized to each task's worst-case JSON so
// a runaway response is cut (and caught via finish_reason) instead of hanging
// or blowing the parse on a 100-item ramble.
const TASK_PARAMS = {
  'smart-capture':     { temperature: 0,   max_tokens: 1024 },
  'process-inbox':     { temperature: 0,   max_tokens: 6000 },
  'import-notes':      { temperature: 0,   max_tokens: 8192 },
  'find-duplicates':   { temperature: 0,   max_tokens: 2048 },
  'url-extract':       { temperature: 0,   max_tokens: 300 },
  'daily-priorities':  { temperature: 0.2, max_tokens: 1500 },
  'plan-day':          { temperature: 0.2, max_tokens: 2000 },
  'plan-week':         { temperature: 0.2, max_tokens: 4000 },
  'analyze-task':      { temperature: 0.2, max_tokens: 800 },
  'project-breakdown': { temperature: 0.4, max_tokens: 2048 },
  'weekly-review':     { temperature: 0.4, max_tokens: 3000 },
};

// How long one attempt may take before the chain moves on. Sized to the
// task's worst-case output at mini-model speeds, not to the happy path.
const TASK_TIMEOUT_MS = {
  'smart-capture': 15_000,
  'url-extract':   15_000,
  'analyze-task':  20_000,
  'plan-week':     60_000,
  'import-notes':  90_000,
};
const DEFAULT_TIMEOUT_MS = 45_000;

// ─── Circuit breaker ─────────────────────────────────────────────────────────
// Per provider/model. Infrastructure failures (timeouts, connection errors,
// 429, 5xx) open it after BREAKER_THRESHOLD within BREAKER_WINDOW_MS; a model
// that is gone or a key that's rejected (404/401/403) opens it at once for
// longer. While open the model is skipped, so a dead model costs nothing per
// request. After the cooldown one call is let through; failing again reopens
// it with a doubled cooldown. Bad JSON / validation failures don't count —
// that's the model's answer, not its availability.
const BREAKER_THRESHOLD = 3;
const BREAKER_WINDOW_MS = 60_000;
const BREAKER_COOLDOWN_MS = 2 * 60_000;
const BREAKER_HARD_COOLDOWN_MS = 10 * 60_000;
const BREAKER_MAX_COOLDOWN_MS = 30 * 60_000;

const breakers = new Map(); // key → { failures: number[], openUntil, cooldown, reason }

const keyOf = ({ provider, model }) => `${provider}/${model}`;

function breakerFor(key) {
  let b = breakers.get(key);
  if (!b) { b = { failures: [], openUntil: 0, cooldown: 0, reason: null }; breakers.set(key, b); }
  return b;
}

function isOpen(key) {
  return breakerFor(key).openUntil > Date.now();
}

// Returns 'hard' | 'soft' | null (null = not an availability failure).
export function classifyFailure(err) {
  const status = err?.status;
  if (status === 404 || status === 401 || status === 403) return 'hard';
  if (status === 429 || (status >= 500 && status < 600)) return 'soft';
  const name = err?.constructor?.name || err?.name || '';
  if (/Timeout|Connection|Abort/i.test(name) || /timed? ?out|ECONN|ETIMEDOUT|fetch failed/i.test(err?.message || '')) return 'soft';
  return null;
}

function recordFailure(key, kind, err) {
  if (!kind) return;
  const b = breakerFor(key);
  const now = Date.now();
  const wasProbing = b.cooldown > 0 && b.openUntil <= now;
  b.failures = b.failures.filter((t) => now - t < BREAKER_WINDOW_MS);
  b.failures.push(now);
  let cooldown = 0;
  if (kind === 'hard') cooldown = Math.max(BREAKER_HARD_COOLDOWN_MS, b.cooldown * 2);
  else if (wasProbing) cooldown = Math.min(BREAKER_MAX_COOLDOWN_MS, b.cooldown * 2);
  else if (b.failures.length >= BREAKER_THRESHOLD) cooldown = BREAKER_COOLDOWN_MS;
  if (!cooldown) return;
  b.cooldown = Math.min(BREAKER_MAX_COOLDOWN_MS, cooldown);
  b.openUntil = now + b.cooldown;
  b.reason = String(err?.message || err?.status || '').slice(0, 200);
  b.failures = [];
  alert(`breaker:${key}`, `AI model ${key} disabled for ${Math.round(b.cooldown / 60000)} min`, b.reason);
}

function recordSuccess(key) {
  const b = breakers.get(key);
  if (b && (b.cooldown || b.failures.length)) {
    if (b.cooldown) console.log(`[ai] ${key} recovered`);
    breakers.set(key, { failures: [], openUntil: 0, cooldown: 0, reason: null });
  }
}

// ─── Alerts ──────────────────────────────────────────────────────────────────
// Sentry event every time; founder email at most once per hour per alert key
// (FOUNDER_NOTIFY_EMAIL, the same address that gets sign-up pings).
const ALERT_EMAIL_INTERVAL_MS = 60 * 60_000;
const lastAlertMail = new Map();

function alert(key, title, detail = '') {
  console.error(`[ai] ALERT ${title}${detail ? ` — ${detail}` : ''}`);
  captureError(new Error(`[ai] ${title}`), { route: 'ai', extra: { key, detail } });
  const to = process.env.FOUNDER_NOTIFY_EMAIL;
  if (!to) return;
  const now = Date.now();
  if (now - (lastAlertMail.get(key) || 0) < ALERT_EMAIL_INTERVAL_MS) return;
  lastAlertMail.set(key, now);
  const text = `${title}\n\n${detail}\n\n${new Date().toISOString()}\nRouting can be changed without a deploy via the AI_ROUTING / GROQ_MODEL env vars on Railway.`;
  sendEmail({ to, subject: `Cleartable AI: ${title}`, text, html: `<pre style="font-family:monospace">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>` })
    .catch((err) => console.error('[ai] alert mail failed:', err.message));
}

// ─── complete() ──────────────────────────────────────────────────────────────

// Test-only: force every complete() call onto one {provider, model}, bypassing
// ROUTING and the breaker, so scripts/eval-* can A/B models against the real
// functions. Never set in production code.
let _forceRoute = null;
export function __setForceRoute(r) { _forceRoute = r; }

// Unified chat completion. Returns parsed JSON, or null if every model in the
// task's chain fails (the caller then degrades — e.g. Smart Capture saves the
// raw text). A JSON.parse failure or a truncated response (finish_reason=length)
// counts as that model failing and moves to the next one.
//
// `validate` (optional) is a fn(parsed) → array of problem strings. On problems,
// ONE repair round-trip is made on the same model (it sees its own output plus
// the problem list); if the repair still fails validation, the next model is
// tried. Validators should only report problems that make the whole answer
// unusable — drop bad items instead of reporting them where the caller can.
export async function complete(task, params, validate = null) {
  const chain = _forceRoute ? [_forceRoute] : (ROUTING[task] || HEAVY);
  const available = chain.filter((r) => PROVIDERS[r.provider]);
  if (!available.length) return null;
  // Skip models whose breaker is open — unless every one is, in which case try
  // the first anyway rather than fail without asking anyone.
  let attempts = _forceRoute ? available : available.filter((r) => !isOpen(keyOf(r)));
  if (!attempts.length) attempts = available.slice(0, 1);

  const tuning = TASK_PARAMS[task] || {};
  const taskTimeout = TASK_TIMEOUT_MS[task] || DEFAULT_TIMEOUT_MS;
  const errors = [];
  for (const route of attempts) {
    const { provider, model } = route;
    const key = keyOf(route);
    const client = PROVIDERS[provider];
    const timeout = provider === 'groq' ? Math.min(taskTimeout, GROQ_TIMEOUT_MS) : taskTimeout;
    try {
      let messages = params.messages;
      for (let round = 0; round < 2; round++) {
        // gpt-oss spends its max_tokens on hidden reasoning first; low effort
        // keeps the JSON from being truncated on longer answers.
        const extra = /gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {};
        const res = await client.chat.completions.create(
          { ...tuning, ...params, ...extra, messages, model },
          { timeout },
        );
        recordSuccess(key);
        const choice = res.choices[0];
        if (choice.finish_reason === 'length') throw new Error('response truncated (finish_reason=length)');
        const parsed = JSON.parse(choice.message.content);
        const problems = validate ? validate(parsed) : [];
        if (!problems.length) {
          if (route !== chain[0] && !_forceRoute) console.warn(`[ai] ${task} served by fallback ${key}`);
          return parsed;
        }
        if (round === 1) throw new Error(`schema validation failed after repair: ${problems.slice(0, 5).join('; ')}`);
        console.warn(`AI[${task}] ${key} schema problems, repairing: ${problems.slice(0, 5).join('; ')}`);
        messages = [
          ...params.messages,
          { role: 'assistant', content: choice.message.content },
          { role: 'user', content: `Your JSON response had these problems:\n- ${problems.join('\n- ')}\n\nReturn the FULL corrected JSON object only — same data, with these problems fixed.` },
        ];
      }
    } catch (err) {
      errors.push(`${key}: ${err.status || ''} ${err.message}`.trim());
      console.error(`AI[${task}] ${key} failed: ${err.message}`);
      if (!_forceRoute) recordFailure(key, classifyFailure(err), err);
    }
  }
  if (errors.length && !_forceRoute) alert(`exhausted:${task}`, `every model failed for ${task}`, errors.join('\n'));
  return null;
}

// ─── Model watchdog ──────────────────────────────────────────────────────────
// Lists each provider's models at boot and every 6 hours and alerts when a
// model in the routing table is missing, so a retirement is found by us, not
// by a user. Free: /models costs no tokens. A missing model's breaker is opened
// so requests skip it until it reappears.
const WATCHDOG_INTERVAL_MS = 6 * 60 * 60_000;

export async function checkModelAvailability() {
  const wanted = new Map(); // provider → Set(model)
  for (const chain of Object.values(ROUTING)) {
    for (const { provider, model } of chain) {
      if (!PROVIDERS[provider]) continue;
      if (!wanted.has(provider)) wanted.set(provider, new Set());
      wanted.get(provider).add(model);
    }
  }
  const report = {};
  for (const [provider, models] of wanted) {
    try {
      const ids = new Set();
      for await (const m of PROVIDERS[provider].models.list()) ids.add(m.id);
      for (const model of models) {
        const ok = ids.has(model);
        report[`${provider}/${model}`] = ok;
        if (!ok) {
          const b = breakerFor(`${provider}/${model}`);
          b.cooldown = WATCHDOG_INTERVAL_MS;
          b.openUntil = Date.now() + WATCHDOG_INTERVAL_MS;
          b.reason = 'not listed by provider';
          alert(`missing:${provider}/${model}`, `AI model ${provider}/${model} is no longer offered`, `Routing skips it until it reappears. Update AI_ROUTING / GROQ_MODEL.`);
        } else if (breakers.get(`${provider}/${model}`)?.reason === 'not listed by provider') {
          recordSuccess(`${provider}/${model}`);
        }
      }
    } catch (err) {
      // Listing failing isn't proof the models are gone — log, don't open breakers.
      console.warn(`[ai] model list for ${provider} failed: ${err.message}`);
    }
  }
  return report;
}

export function startModelWatchdog() {
  if (!aiConfigured()) return;
  const run = () => checkModelAvailability()
    .then((r) => {
      const missing = Object.entries(r).filter(([, ok]) => !ok).map(([k]) => k);
      console.log(`[ai] model check: ${Object.keys(r).length} configured, ${missing.length ? `missing ${missing.join(', ')}` : 'all available'}`);
    })
    .catch((err) => console.warn('[ai] model check failed:', err.message));
  run();
  setInterval(run, WATCHDOG_INTERVAL_MS).unref();
}

// For logs / a status view: routing plus any model currently skipped.
export function aiStatus() {
  const now = Date.now();
  const open = {};
  for (const [key, b] of breakers) {
    if (b.openUntil > now) open[key] = { until: new Date(b.openUntil).toISOString(), reason: b.reason };
  }
  return {
    routing: Object.fromEntries(Object.entries(ROUTING).map(([t, c]) => [t, c.map(keyOf)])),
    open,
  };
}
