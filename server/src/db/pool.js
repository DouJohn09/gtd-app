import pg from 'pg';

// Single shared connection pool for the whole server process.
// Reads DATABASE_URL from env (set by Railway in prod, by .env locally).
//
// max=5 leaves headroom under Railway's hobby-tier ~10 connection limit
// for migration tooling, ad-hoc psql, and future workers.
//
// Booleans + dates: pg returns BOOLEAN as JS boolean, DATE as JS Date object
// by default. We override the DATE parser to return ISO YYYY-MM-DD strings
// because the entire app already treats due_date/start_date as strings
// throughout the client and date utilities. Letting pg return Date objects
// would break every date comparison and date-render in the codebase.
pg.types.setTypeParser(pg.types.builtins.DATE, (val) => val);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err);
});

// Boot-time sanity check. Throws if PG is unreachable so the server
// fails loudly instead of crashing on the first request.
export async function pingDb() {
  const { rows } = await pool.query('SELECT 1 as ok');
  if (rows[0]?.ok !== 1) throw new Error('Postgres ping failed');
}
