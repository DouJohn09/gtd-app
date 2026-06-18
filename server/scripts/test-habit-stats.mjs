// Unit tests for the schedule-aware habit stats helpers.
// Run: node scripts/test-habit-stats.mjs  (from server/) or `npm run test:habits`.
//
// Anchor date: 2026-06-18 is a Thursday, so:
//   06-18 Thu · 06-17 Wed · 06-16 Tue · 06-15 Mon · 06-12 Fri · 06-10 Wed · 06-08 Mon
// Weeks (Mon-start): current 06-15..06-21 · prior 06-08..06-14 · before 06-01..06-07
import assert from 'node:assert/strict';
import { computeStreak, computeCompletion, isDueOn } from '../src/routes/habits.js';

const TODAY = '2026-06-18';
const set = (...dates) => new Set(dates);
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

// --- isDueOn ---
const mwf = { frequency: 'specific_days', target_days: ['mon', 'wed', 'fri'] };
t('isDueOn: Mon/Wed/Fri habit due Mon, not Thu', () => {
  assert.equal(isDueOn(mwf, '2026-06-15'), true);  // Mon
  assert.equal(isDueOn(mwf, '2026-06-17'), true);  // Wed
  assert.equal(isDueOn(mwf, '2026-06-18'), false); // Thu
});
t('isDueOn: daily always due', () => {
  assert.equal(isDueOn({ frequency: 'daily' }, '2026-06-18'), true);
});

// --- daily streak ---
t('daily streak: 4 consecutive incl. today', () => {
  const { streak, unit } = computeStreak({ frequency: 'daily' },
    set('2026-06-18', '2026-06-17', '2026-06-16', '2026-06-15'), TODAY);
  assert.equal(streak, 4);
  assert.equal(unit, 'day');
});
t("daily streak: today not done yet doesn't break (counts back from yesterday)", () => {
  const { streak } = computeStreak({ frequency: 'daily' },
    set('2026-06-17', '2026-06-16', '2026-06-15'), TODAY);
  assert.equal(streak, 3);
});
t('daily streak: gap breaks it', () => {
  const { streak } = computeStreak({ frequency: 'daily' },
    set('2026-06-18', '2026-06-16', '2026-06-15'), TODAY); // missing 06-17
  assert.equal(streak, 1);
});

// --- specific_days streak (the bug: old code scored this as 1) ---
t('specific_days streak: skips non-scheduled days (was the bug)', () => {
  const completed = set('2026-06-17', '2026-06-15', '2026-06-12', '2026-06-10'); // Wed,Mon,Fri,Wed
  const { streak, unit } = computeStreak(mwf, completed, TODAY); // missing 06-08 Mon
  assert.equal(streak, 4); // old buggy implementation returned 1
  assert.equal(unit, 'day');
});
t('specific_days with empty target_days: returns 0 and does not hang', () => {
  const { streak } = computeStreak({ frequency: 'specific_days', target_days: [] }, set(), TODAY);
  assert.equal(streak, 0);
});

// --- weekly streak ---
const weekly3 = { frequency: 'weekly', target_days: [3] };
t('weekly streak: consecutive weeks meeting target', () => {
  const completed = set(
    '2026-06-15', '2026-06-16', '2026-06-17', // current week: 3 ✓
    '2026-06-08', '2026-06-09', '2026-06-10', // prior week: 3 ✓
    '2026-06-01', '2026-06-02',               // week before: 2 ✗
  );
  const { streak, unit } = computeStreak(weekly3, completed, TODAY);
  assert.equal(streak, 2);
  assert.equal(unit, 'week');
});
t("weekly streak: in-progress current week below target doesn't break", () => {
  const completed = set(
    '2026-06-15',                             // current week: 1 (in progress)
    '2026-06-08', '2026-06-09', '2026-06-10', // prior: 3 ✓
    '2026-06-01', '2026-06-02', '2026-06-03', // before: 3 ✓
  );
  const { streak } = computeStreak(weekly3, completed, TODAY);
  assert.equal(streak, 2);
});

// --- completion rate ---
t('completion (daily, 7d window): 4 of 7', () => {
  const r = computeCompletion({ frequency: 'daily' },
    set('2026-06-18', '2026-06-17', '2026-06-16', '2026-06-15'), TODAY, 7);
  assert.equal(r.expectedLast30, 7);
  assert.equal(r.completedLast30, 4);
  assert.equal(r.completionRate, 57);
});
t('completion (weekly target 3, 14d window): pro-rated to 100%', () => {
  const r = computeCompletion(weekly3,
    set('2026-06-18', '2026-06-17', '2026-06-16', '2026-06-11', '2026-06-10', '2026-06-09'), TODAY, 14);
  assert.equal(r.expectedLast30, 6); // round(14/7 * 3)
  assert.equal(r.completedLast30, 6);
  assert.equal(r.completionRate, 100);
});
t('completion (specific_days): only scheduled days count as expected', () => {
  // last 14 days from Thu 06-18 back to 06-05; Mon/Wed/Fri occurrences:
  // 06-17(W),06-15(M),06-12(F),06-10(W),06-08(M),06-05(F) = 6 scheduled days
  const r = computeCompletion(mwf, set('2026-06-17', '2026-06-15', '2026-06-12'), TODAY, 14);
  assert.equal(r.expectedLast30, 6);
  assert.equal(r.completedLast30, 3);
  assert.equal(r.completionRate, 50);
});

console.log(`\n✅ ${passed} habit-stats tests passed`);
