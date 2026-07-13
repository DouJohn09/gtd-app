#!/usr/bin/env node
// Submit the marketing site's URLs to IndexNow (Bing, Yandex, Seznam, DuckDuckGo,
// and other participating engines via the shared api.indexnow.org endpoint).
//
// The key file must already be live at https://<host>/<key>.txt — IndexNow fetches
// it to verify ownership before accepting the submission. See landing-page/<key>.txt.
//
// Usage:
//   node server/scripts/indexnow-submit.js            # submit every URL in the sitemap
//   node server/scripts/indexnow-submit.js <url> ...  # submit only the given URLs
//
// Re-run whenever you publish or meaningfully update a page.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HOST = 'cleartable.app';
const KEY = '92fc0fa8a35e6bfa89dada0d9dc5acaf';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITEMAP = join(__dirname, '../../landing-page/sitemap.xml');

function urlsFromSitemap() {
  const xml = readFileSync(SITEMAP, 'utf8');
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

async function main() {
  const cliUrls = process.argv.slice(2);
  const urlList = cliUrls.length ? cliUrls : urlsFromSitemap();

  if (!urlList.length) {
    console.error('No URLs to submit.');
    process.exit(1);
  }
  // Guard: every URL must be on our host, or IndexNow rejects the whole batch (422).
  const foreign = urlList.filter((u) => new URL(u).host !== HOST);
  if (foreign.length) {
    console.error(`Refusing to submit — these URLs are not on ${HOST}:\n${foreign.join('\n')}`);
    process.exit(1);
  }

  console.log(`Submitting ${urlList.length} URL(s) to IndexNow:`);
  urlList.forEach((u) => console.log(`  ${u}`));

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  });

  const body = await res.text();
  // IndexNow: 200 = accepted, 202 = accepted/pending. Anything else is a real error.
  if (res.status === 200 || res.status === 202) {
    console.log(`\n✓ Accepted (HTTP ${res.status}). Engines will crawl these on their own schedule.`);
  } else {
    console.error(`\n✗ IndexNow returned HTTP ${res.status}${body ? `: ${body}` : ''}`);
    if (res.status === 403) console.error('  → 403 usually means the key file is not reachable at ' + KEY_LOCATION);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
