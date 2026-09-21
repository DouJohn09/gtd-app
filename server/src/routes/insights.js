import { Router } from 'express';
import { completionPatterns, habitPatterns, planReality } from '../services/insights.js';
import { getUserPlan } from '../services/billing.js';

const router = Router();

// GET /api/insights — the four cards. Deterministic, no AI, no usage charge.
// Free users get "Productive hours" in full and the other three as locked
// shells (no data leaves the server), which is the Pro "analytics" promise on
// the pricing page made concrete.
router.get('/', async (req, res) => {
  try {
    const tz = req.clientTimezone;
    const plan = await getUserPlan(req.user.id);
    const pro = plan === 'pro';

    const [completion, habits, reality] = await Promise.all([
      completionPatterns(req.user.id, tz),
      pro ? habitPatterns(req.user.id, tz) : null,
      pro ? planReality(req.user.id, tz, { today: req.today }) : null,
    ]);

    res.json({
      plan,
      timezone: tz,
      hours: { ...completion, byWeekdayHour: undefined },
      week: pro
        ? { total: completion.total, enough: completion.enough, byWeekday: completion.byWeekday, sentence: completion.weekSentence, strongestDay: completion.strongestDay, weakestDay: completion.weakestDay }
        : { locked: true },
      habits: pro ? habits : { locked: true },
      reality: pro ? reality : { locked: true },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
