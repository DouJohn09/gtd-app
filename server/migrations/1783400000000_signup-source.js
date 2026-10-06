export async function up(pgm) {
  pgm.addColumns('users', {
    signup_referrer: { type: 'text' },
    signup_utm: { type: 'jsonb' },
  });
}

export async function down(pgm) {
  pgm.dropColumns('users', ['signup_referrer', 'signup_utm']);
}
