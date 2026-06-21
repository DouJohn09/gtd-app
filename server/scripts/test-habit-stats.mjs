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

// --- skip / rest days (daily) ---
t('daily streak: a skipped past due-day is neutral, does not break the streak', () => {
  // done today, yesterday, day-before; 06-15 was a rest day (no completion logged)
  const completed = set('2026-06-18', '2026-06-17', '2026-06-16', '2026-06-14');
  const skipped = set('2026-06-15');
  const { streak } = computeStreak({ frequency: 'daily' }, completed, TODAY, skipped);
  // 18,17,16,(15 rest bridges),14 — chain survives the rest day. Streak counts the
  // 4 completions; the rest day bridges but doesn't itself increment. (Contrast the
  // next test: the same day *missed* instead of rested breaks the chain at 3.)
  assert.equal(streak, 4);
});
t('daily streak: a missed (not skipped) past due-day still breaks it', () => {
  const completed = set('2026-06-18', '2026-06-17', '2026-06-16', '2026-06-14'); // 06-15 simply missing
  const { streak } = computeStreak({ frequency: 'daily' }, completed, TODAY); // no skip set
  assert.equal(streak, 3); // breaks at the missing 06-15
});
t('daily streak: today marked as rest is neutral (counts back from yesterday)', () => {
  const completed = set('2026-06-17', '2026-06-16', '2026-06-15');
  const skipped = set('2026-06-18'); // resting today
  const { streak } = computeStreak({ frequency: 'daily' }, completed, TODAY, skipped);
  assert.equal(streak, 3);
});

// --- skip / rest days (specific_days) ---
t('specific_days streak: skipped scheduled day is neutral', () => {
  // Mon/Wed/Fri; completed Wed 06-17 & Mon 06-15, rested Fri 06-12, completed Wed 06-10
  const completed = set('2026-06-17', '2026-06-15', '2026-06-10');
  const skipped = set('2026-06-12');
  const { streak } = computeStreak(mwf, completed, TODAY, skipped);
  assert.equal(streak, 3); // 17,15,(12 rest),10 — holds across the rested Friday
});

// --- skip excluded from completion expected ---
t('completion (daily): skipped due-days are excluded from expected', () => {
  // 7d window: done 4 of the days, 1 day rested → expected drops to 6, not 7
  const completed = set('2026-06-18', '2026-06-17', '2026-06-16', '2026-06-15');
  const skipped = set('2026-06-14');
  const r = computeCompletion({ frequency: 'daily' }, completed, TODAY, 7, skipped);
  assert.equal(r.expectedLast30, 6); // 7 days − 1 rest day
  assert.equal(r.completedLast30, 4);
  assert.equal(r.completionRate, 67); // round(4/6 * 100)
});

// --- interval ("every N days") ---
// Anchor 2026-06-09 (a Tuesday), N=3 → due 06-09, 06-12, 06-15, 06-18, 06-21…
const every3 = { frequency: 'interval', target_days: [3], created_at: '2026-06-09' };
t('isDueOn interval: due on anchor + every Nth day, not between', () => {
  assert.equal(isDueOn(every3, '2026-06-18'), true);   // diff 9
  assert.equal(isDueOn(every3, '2026-06-15'), true);   // diff 6
  assert.equal(isDueOn(every3, '2026-06-09'), true);   // diff 0 (anchor)
  assert.equal(isDueOn(every3, '2026-06-17'), false);  // diff 8
  assert.equal(isDueOn(every3, '2026-06-06'), false);  // before the anchor
});
t('interval streak: counts back over due days, stops at the anchor', () => {
  const completed = set('2026-06-18', '2026-06-15', '2026-06-12', '2026-06-09');
  const { streak, unit } = computeStreak(every3, completed, TODAY);
  assert.equal(streak, 4); // 4 due-days completed; nothing due before the anchor
  assert.equal(unit, 'day');
});
t('interval streak: a missed due-day breaks it (non-due days ignored)', () => {
  const completed = set('2026-06-18', '2026-06-15'); // 06-12 due but missing
  const { streak } = computeStreak(every3, completed, TODAY);
  assert.equal(streak, 2);
});
t('interval completion: only interval due-days count as expected', () => {
  // last 30d due-days ≥ anchor: 06-09, 06-12, 06-15, 06-18 = 4 expected
  const r = computeCompletion(every3, set('2026-06-18', '2026-06-15', '2026-06-12'), TODAY, 30);
  assert.equal(r.expectedLast30, 4);
  assert.equal(r.completedLast30, 3);
  assert.equal(r.completionRate, 75);
});

// --- skip is a no-op for weekly ---
t('weekly streak: skip set is ignored (no-op)', () => {
  const completed = set(
    '2026-06-15', '2026-06-16', '2026-06-17', // current week: 3 ✓
    '2026-06-08', '2026-06-09', '2026-06-10', // prior week: 3 ✓
  );
  const skipped = set('2026-06-11'); // should have no effect on weekly
  const { streak, unit } = computeStreak(weekly3, completed, TODAY, skipped);
  assert.equal(streak, 2);
  assert.equal(unit, 'week');
});

console.log(`\n✅ ${passed} habit-stats tests passed`);
