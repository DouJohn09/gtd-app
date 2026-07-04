// One dial for how much the app acts without asking: 'off' (fully manual,
// no AI calls at all), 'assisted' (AI suggests, everything waits in the inbox
// for confirmation), 'auto' (confidence-gated auto-routing). Replaces the
// per-device localStorage 'smart_capture_routing' preference so the choice
// follows the account across devices.
//
// New users default to 'assisted' (trust before autonomy; the first-run tour
// asks anyway). Existing users are backfilled to 'auto' because auto-routing
// was the previous effective default — flipping them to 'assisted' would
// silently change capture behavior. Users who explicitly chose 'always_inbox'
// get migrated to 'assisted' client-side from their localStorage key.
//
// ai_accept_streak counts consecutive AI suggestions applied without
// adjustment (reset on any correction) — drives the "turn on Autopilot?"
// nudge at 20. The two nudge timestamps record that a nudge was shown and
// answered, so each fires at most once per account, ever.

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN ai_mode TEXT NOT NULL DEFAULT 'assisted'
        CHECK (ai_mode IN ('off', 'assisted', 'auto')),
      ADD COLUMN ai_accept_streak INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN ai_nudge_autopilot_at TIMESTAMPTZ,
      ADD COLUMN ai_nudge_reminder_at TIMESTAMPTZ;
  `);
  pgm.sql(`UPDATE users SET ai_mode = 'auto';`);
};

export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS ai_mode,
      DROP COLUMN IF EXISTS ai_accept_streak,
      DROP COLUMN IF EXISTS ai_nudge_autopilot_at,
      DROP COLUMN IF EXISTS ai_nudge_reminder_at;
  `);
};
