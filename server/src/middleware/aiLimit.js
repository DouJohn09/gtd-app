import { consume } from '../services/aiUsage.js';
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

// Enforces the daily AI cap for EXPLICIT, user-triggered AI actions (process
// inbox, daily priorities, import notes, find duplicates, weekly review). Over
// the cap → 429 with an upgrade-friendly payload the client can surface as a
// toast. Smart Capture does NOT use this — it degrades to raw manual capture
// instead (see routes/ai.js), because a high-frequency auto-action shouldn't
// hard-stop mid-flow.
//
// Fails OPEN: if the metering query throws, the user keeps their AI action.
// Metering must never break a feature someone may be paying for.
export async function enforceAiLimit(req, res, next) {
  try {
    const status = await consume(req.user.id);
    if (!status.allowed) {
      return res.status(429).json({
        error: 'daily_ai_limit',
        message: `You've used all ${status.limit} of today's AI actions. They reset tomorrow.`,
        limit: status.limit,
        used: status.used,
      });
    }
    req.aiUsage = status;
    next();
  } catch (err) {
    console.error('enforceAiLimit error (failing open):', err);
    next();
  }
}
