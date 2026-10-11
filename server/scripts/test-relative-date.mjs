// Unit tests for deterministic relative-date resolution (no network). Run: npm run test:relative-date
import assert from 'node:assert/strict';
import { resolveRelativeDate as r, upcomingDaysTable } from '../src/lib/relativeDate.js';

const SUN = '2026-10-11';
assert.equal(r('buy groceries Friday', SUN), '2026-10-16');
assert.equal(r('call mom tomorrow', SUN), '2026-10-12');
assert.equal(r('call mom today', SUN), SUN);
assert.equal(r('dentist the day after tomorrow', SUN), '2026-10-13');
assert.equal(r('pay rent by Monday', SUN), '2026-10-12');
assert.equal(r('pay rent this Sunday', SUN), SUN);
assert.equal(r('review next Monday', SUN), '2026-10-12');
assert.equal(r('review next Friday', SUN), '2026-10-16');
assert.equal(r('review next Friday', '2026-10-14'), '2026-10-23');
assert.equal(r('send report Friday', '2026-10-16'), '2026-10-16');
assert.equal(r('send report Thursday', '2026-10-16'), '2026-10-22');
assert.equal(r('call mom tomorrow, buy groceries Friday', SUN), null);
assert.equal(r('gym every Monday', SUN), null);
assert.equal(r('start the course Monday', SUN), null);
assert.equal(r('dentist Oct 20', SUN), null);
assert.equal(r('dentist 20/10 Friday', SUN), null);
assert.equal(r('buy milk', SUN), null);
assert.equal(r('Fridays are for planning', SUN), null);
assert.equal(r('buy groceries Friday', 'garbage'), null);
assert.match(upcomingDaysTable(SUN), /^Sunday 2026-10-11 \(today\), Monday 2026-10-12 \(tomorrow\)/);
assert.ok(upcomingDaysTable(SUN).includes('Friday 2026-10-16'));
console.log('relative-date tests passed');
