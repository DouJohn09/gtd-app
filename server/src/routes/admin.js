import express from 'express';
import { requireAdmin } from '../lib/admin.js';
import { buildPulse } from '../services/pulse.js';
import { serverError } from '../lib/httpErrors.js';

// Founder-only API behind the normal sign-in (requireAuth runs first) plus an
// admin email check. Non-admins get a 404, so the routes look absent.
const router = express.Router();
router.use(requireAdmin);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// GET /api/admin/pulse — everything the Pulse page shows, computed live.
router.get('/pulse', async (req, res) => {
  try {
    res.json(await buildPulse());
  } catch (error) {
    serverError(req, res, error);
  }
});

export default router;
