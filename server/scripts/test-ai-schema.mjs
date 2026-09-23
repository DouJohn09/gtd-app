// Unit tests for the AI response validators (no network). Run: npm run test:ai-schema
import * as v from '../src/services/aiSchema.js';
import assert from 'node:assert/strict';
let r;
// process-inbox: one bad index, one dup, one null, one bad enum on optional field
r = { processed_items: [
  { original_index: 1, recommended_list: 'next_actions', energy_level: 'extreme', priority: '9', due_date: 'tomorrow', confidence: { list: 'sure' } },
  { original_index: 7, recommended_list: 'next_actions' }, null,
  { original_index: 1, recommended_list: 'someday_maybe' },
  { original_index: '2', recommended_list: 'trash' },
  { original_index: 3, recommended_list: 'waiting_for' } ] };
assert.deepEqual(v.validateProcessInbox(3)(r), []);
assert.deepEqual(r.processed_items.map(i => i.original_index), [1, 3]);
assert.equal(r.processed_items[0].energy_level, null); assert.equal(r.processed_items[0].priority, 5);
assert.equal(r.processed_items[0].due_date, null); assert.equal(r.processed_items[0].confidence.list, undefined);
// all bad -> problems (repair)
assert.ok(v.validateProcessInbox(3)({ processed_items: [{ original_index: 9, recommended_list: 'x' }] }).length > 0);
assert.ok(v.validateProcessInbox(3)({ nope: 1 }).length > 0);
// empty list is fine
assert.deepEqual(v.validateProcessInbox(3)({ processed_items: [] }), []);
// import-notes: bad list -> inbox, empty title dropped
r = { items: [{ title: 'Call Bob', recommended_list: 'today' }, { title: '' }, 'junk'] };
assert.deepEqual(v.validateImportNotes(r), []); assert.equal(r.items.length, 1); assert.equal(r.items[0].recommended_list, 'inbox');
// plan-day: bad start cleared, dup dropped, bad duration -> 30, huge clamped
r = { plan: [{ task_index: 1, start: '9am', duration_mins: 'x' }, { task_index: 1, start: '10:00', duration_mins: 30 }, { task_index: 2, start: '10:00', duration_mins: 900 }, { task_index: 5, start: '11:00', duration_mins: 30 }],
      deferred: [{ task_index: 2, move_to: '2026-09-24' }, { task_index: 3, move_to: 'next week' }] };
assert.deepEqual(v.validatePlanDay(3)(r), []);
assert.deepEqual(r.plan.map(b => [b.task_index, b.start, b.duration_mins]), [[1, null, 30], [2, '10:00', 480]]);
assert.deepEqual(r.deferred.map(d => [d.task_index, d.move_to]), [[3, null]]);
// find-duplicates: bad groups dropped
r = { duplicate_groups: [{ tasks: [{ id: '1', keep: 'true' }, { id: 2, keep: false }] }, { tasks: [{ id: 3, keep: true }, { id: 4, keep: true }] }, { tasks: [{ id: 5 }] }] };
assert.deepEqual(v.validateFindDuplicates(r), []); assert.equal(r.duplicate_groups.length, 1); assert.equal(r.duplicate_groups[0].tasks[0].id, 1);
// weekly-review: bad suggestion dropped, string item dropped, score clamped, non-array fixed
r = { stale_items: [{ id: 1, suggestion: 'archive' }, 'x', { id: 2, suggestion: 'keep' }], system_health_score: 14, recommendations: 'do more' };
assert.deepEqual(v.validateWeeklyReview(r), []); assert.equal(r.stale_items.length, 1); assert.equal(r.system_health_score, 10); assert.deepEqual(r.recommendations, []);
// daily priorities
r = { suggested_focus: [{ task_index: 1, confidence: 'very' }, { task_index: 0 }] };
assert.deepEqual(v.validateDailyPriorities(2)(r), []); assert.equal(r.suggested_focus.length, 1); assert.equal(r.suggested_focus[0].confidence, 'medium');
// smart capture: required list still enforced, optional slop cleared
r = { title: 'x', list: 'next_actions', energy_level: 'huge', scheduled_time: '9', list_confidence: 'eh' };
assert.deepEqual(v.validateSmartCapture(r), []); assert.equal(r.energy_level, null); assert.equal(r.scheduled_time, null); assert.equal(r.list_confidence, 'low');
assert.ok(v.validateSmartCapture({ title: 'x', list: 'bogus' }).length > 0);
// project breakdown
r = { next_actions: [{ title: 'a', energy_level: 'x' }, { title: ' ' }] };
assert.deepEqual(v.validateProjectBreakdown(r), []); assert.equal(r.next_actions.length, 1);
console.log('ALL VALIDATOR TESTS PASS');
