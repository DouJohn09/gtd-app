import { consume } from '../services/aiUsage.js';

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
