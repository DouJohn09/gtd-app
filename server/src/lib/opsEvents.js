import { pool } from '../db/pool.js';

// One row per server 500 / client crash / inquiry for the monitoring pulse.
// Fire-and-forget: recording an error must never cause another one.
export function recordOpsEvent(kind, label) {
  pool.query('INSERT INTO ops_events (kind, label) VALUES ($1, $2)', [kind, String(label ?? '').slice(0, 200)])
    .catch((err) => console.error('[ops] could not record event:', err.message));
}
