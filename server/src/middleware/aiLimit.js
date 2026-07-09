import { check, charge } from '../services/aiUsage.js';
import { getAiMode } from '../services/userPrefs.js';

// Blocks EXPLICIT AI actions when the user has AI turned off. ai_mode is the
// server's source of truth (not a client flag), so a stale or hostile client
// can't run AI — shipping a user's task titles/notes to a provider — for someone
// who disabled it. Routes that must still serve non-AI data when off (smart-
// capture → raw capture, weekly-review → lists/stats) check getAiMode inline
// instead of using this gate. Fails OPEN: getAiMode already defaults to
// 'assisted' on a DB error, so a blip never wedges a feature.
export async function requireAiEnabled(req, res, next) {
  const mode = await getAiMode(req.user.id);
  if (mode === 'off') {
    return res.status(403).json({
      error: 'ai_disabled',
      message: 'AI features are turned off. Turn them back on in Settings to use this.',
    });
  }
  req.aiMode = mode;
  next();
}

// Pre-flight gate for EXPLICIT, user-triggered AI actions (process inbox, daily
// priorities, plan day, import notes, find duplicates, task analyze, project
// breakdown, url extract). Over the cap → 429 with an upgrade-friendly payload.
// This only CHECKS — it does not increment. The route calls chargeAiUsage(req)
// after the AI actually succeeds, so a no-op (empty inbox) or a provider failure
// never burns budget. Smart Capture doesn't use this gate (it degrades to raw
// capture and charges inline on successful enrichment).
//
// Fails OPEN: if the metering query throws, the user keeps their AI action.
// Metering must never break a feature someone may be paying for.
export async function enforceAiLimit(req, res, next) {
  try {
    const status = await check(req.user.id);
    if (!status.allowed) {
      return res.status(429).json({
        error: 'daily_ai_limit',
        message: `You've used all ${status.limit} of today's AI actions. They reset tomorrow.`,
        limit: status.limit,
        used: status.used,
      });
    }
    req.aiWeight = 1;
    next();
  } catch (err) {
    console.error('enforceAiLimit error (failing open):', err);
    next();
  }
}

// Record a successful AI call against today's budget. Called from the route once
// the AI result is known-good. Non-fatal: a metering write must never fail the
// response the user already earned.
export async function chargeAiUsage(req, weight = req.aiWeight ?? 1) {
  try {
    await charge(req.user.id, weight);
  } catch (err) {
    console.error('chargeAiUsage error (non-fatal):', err);
  }
}
