import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Per-user burst limiter for AI-backed endpoints. This is an ANTI-ABUSE layer,
// separate from the daily usage metering (services/aiUsage.js): metering is the
// paid-plan budget and currently ships OFF, so without this a single account
// could script the AI routes in a tight loop and — because Groq's free tier
// throttles and every call then falls over to PAID OpenAI — run up real cost
// (and insert junk rows). A human never triggers 30 AI ops in a minute; a loop
// does hundreds. Keyed by user id (requireAuth runs first), IP as fallback.
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `u:${req.user.id}` : ipKeyGenerator(req.ip)),
  handler: (req, res) => {
    res.status(429).json({
      error: 'rate_limited',
      message: "You're doing that a bit fast — give it a few seconds and try again.",
    });
  },
});
