// Daily reminder emails report each send and each failure to ops_events so
// Pulse can show "sent / failed". Reminders broke silently for three weeks
// (Oct 9 – Nov 1, 2026) because nothing counted them.
export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE ops_events DROP CONSTRAINT ops_events_kind_check;
    ALTER TABLE ops_events ADD CONSTRAINT ops_events_kind_check
      CHECK (kind IN ('server_error', 'client_error', 'inquiry', 'reminder_sent', 'reminder_failed'));
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DELETE FROM ops_events WHERE kind IN ('reminder_sent', 'reminder_failed');
    ALTER TABLE ops_events DROP CONSTRAINT ops_events_kind_check;
    ALTER TABLE ops_events ADD CONSTRAINT ops_events_kind_check
      CHECK (kind IN ('server_error', 'client_error', 'inquiry'));
  `);
};
