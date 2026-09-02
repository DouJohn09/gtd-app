import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

// Fail fast on a misconfigured process. Without this, a missing JWT_SECRET
// boots fine and then answers every request with 401 "Invalid token", and a
// missing GOOGLE_CLIENT_ID fails silently at the first sign-in.
const isProd = process.env.NODE_ENV === 'production';
const problems = [];

if (!process.env.DATABASE_URL) problems.push('DATABASE_URL is not set');
if (!process.env.JWT_SECRET) problems.push('JWT_SECRET is not set');
else if (process.env.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be at least 32 characters (use 64 random bytes)');
if (!process.env.GOOGLE_CLIENT_ID) problems.push('GOOGLE_CLIENT_ID is not set (sign-in cannot work)');

if (isProd) {
  if (process.env.PADDLE_ALLOW_SANDBOX_CHECKOUT === '1') {
    problems.push('PADDLE_ALLOW_SANDBOX_CHECKOUT=1 must never be set in production');
  }
  if (process.env.PADDLE_ENV === 'production') {
    for (const k of ['PADDLE_API_KEY', 'PADDLE_WEBHOOK_SECRET', 'PADDLE_CLIENT_TOKEN',
                     'PADDLE_PRICE_PRO_MONTHLY', 'PADDLE_PRICE_PRO_YEARLY', 'PADDLE_PRICE_FOUNDER']) {
      if (!process.env[k]) problems.push(`${k} is required when PADDLE_ENV=production`);
    }
    if (process.env.PADDLE_CLIENT_TOKEN?.startsWith('test_')) problems.push('PADDLE_CLIENT_TOKEN is a sandbox token but PADDLE_ENV=production');
  }
}

if (problems.length) {
  console.error('Refusing to start — configuration problems:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

// Soft warnings: the app runs, but a feature is dormant.
if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) console.warn('[env] no AI provider key set — AI features are disabled');
if (!process.env.RESEND_API_KEY) console.warn('[env] RESEND_API_KEY unset — emails are logged, not sent');
if (isProd && !process.env.SENTRY_DSN) console.warn('[env] SENTRY_DSN unset — errors go to stdout only');
if (isProd && process.env.PADDLE_ENV !== 'production') console.warn(`[env] PADDLE_ENV=${process.env.PADDLE_ENV || 'sandbox'} — checkout is hidden from users`);
