#!/usr/bin/env node
// Seed realistic demo data for video recording.
//
// Usage:
//   node server/scripts/seed-demo.js --user you@example.com [--reset]
//
// IMPORTANT: stop the dev server before running. sql.js is in-memory; the
// server only sees these writes after restart.

import { initDb, getDb, saveDb } from '../src/db/schema.js';
import { TaskModel, ProjectModel } from '../src/db/models.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { user: null, reset: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user') out.user = args[++i];
    else if (args[i] === '--reset') out.reset = true;
  }
  if (!out.user) {
    console.error('Usage: node server/scripts/seed-demo.js --user <email> [--reset]');
    process.exit(1);
  }
  return out;
}

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { user: email, reset } = parseArgs();
  await initDb();
  const db = getDb();

  // Look up user
  const userStmt = db.prepare('SELECT id FROM users WHERE email = ?');
  userStmt.bind([email]);
  if (!userStmt.step()) {
    userStmt.free();
    console.error(`User not found: ${email}. Sign in to the app first.`);
    process.exit(1);
  }
  const userId = userStmt.getAsObject().id;
  userStmt.free();
  console.log(`Seeding demo data for user ${email} (id=${userId})`);

  if (reset) {
    db.run('DELETE FROM tasks WHERE user_id = ?', [userId]);
    db.run('DELETE FROM projects WHERE user_id = ?', [userId]);
    console.log('  Cleared existing tasks + projects');
  }

  // Make sure a couple of useful contexts exist
  for (const name of ['@home', '@work', '@computer', '@phone', '@errands']) {
    try {
      db.run('INSERT OR IGNORE INTO contexts (name, user_id) VALUES (?, ?)', [name, userId]);
    } catch {}
  }

  // Projects
  const websiteRedesign = ProjectModel.create({
    name: 'Q2 website redesign',
    description: 'Refresh marketing site before launch',
    outcome: 'New site live by end of May',
    execution_mode: 'sequential',
  }, userId);

  const tripPlanning = ProjectModel.create({
    name: 'Lisbon trip · June',
    description: 'Long weekend in Lisbon',
    outcome: 'Booked, packed, and budgeted',
    execution_mode: 'parallel',
  }, userId);

  const launchPrep = ProjectModel.create({
    name: 'GTD Flow launch',
    description: 'Get the app to public launch',
    outcome: 'Soft launch on r/gtd',
    execution_mode: 'parallel',
  }, userId);

  const homeRefi = ProjectModel.create({
    name: 'Refinance mortgage',
    description: 'Lower rate before October',
    outcome: 'Loan re-signed',
    execution_mode: 'parallel',
  }, userId);

  // Inbox (intentionally vague — perfect for the AI processing shot)
  const inboxItems = [
    'fix that thing with the export',
    'mom birthday',
    'cancel old domain renewal',
    'bike tune-up',
    'follow up with sara about the contract',
    'idea: weekly digest email',
  ];
  inboxItems.forEach(t => TaskModel.create({ title: t, list: 'inbox' }, userId));

  // Next Actions
  const nextActions = [
    { title: 'Draft homepage hero copy', context: '@computer', energy_level: 'high', time_estimate: 45, project_id: websiteRedesign.id, position: 0 },
    { title: 'Pick three reference sites for layout', context: '@computer', energy_level: 'medium', time_estimate: 30, project_id: websiteRedesign.id, position: 1 },
    { title: 'Book Airbnb in Alfama', context: '@computer', energy_level: 'low', time_estimate: 20, project_id: tripPlanning.id },
    { title: 'Confirm flight times with Sam', context: '@phone', energy_level: 'low', time_estimate: 10, project_id: tripPlanning.id },
    { title: 'Write Product Hunt launch copy', context: '@computer', energy_level: 'high', time_estimate: 60, project_id: launchPrep.id, is_daily_focus: 1 },
    { title: 'Record demo video', context: '@computer', energy_level: 'medium', time_estimate: 90, project_id: launchPrep.id, is_daily_focus: 1 },
    { title: 'Pick up dry cleaning', context: '@errands', energy_level: 'low', time_estimate: 15 },
    { title: 'Order new printer cartridges', context: '@computer', energy_level: 'low', time_estimate: 10 },
    { title: 'Read Q1 retro from Anna', context: '@computer', energy_level: 'medium', time_estimate: 20 },
    { title: 'Compare two refi quotes', context: '@home', energy_level: 'high', time_estimate: 45, project_id: homeRefi.id },
  ];
  nextActions.forEach(t => TaskModel.create({ ...t, list: 'next_actions', priority: t.is_daily_focus ? 4 : 2 }, userId));

  // Waiting For
  TaskModel.create({ title: 'Refi rate quote', list: 'waiting_for', waiting_for_person: 'Loan officer (Mark)', project_id: homeRefi.id }, userId);
  TaskModel.create({ title: 'Signed contract back', list: 'waiting_for', waiting_for_person: 'Sara' }, userId);

  // Someday/Maybe
  TaskModel.create({ title: 'Learn Rust', list: 'someday_maybe', energy_level: 'high' }, userId);
  TaskModel.create({ title: 'Renovate the garage', list: 'someday_maybe' }, userId);

  // Time blocks for today + tomorrow (so calendar is alive on screen)
  TaskModel.create({
    title: 'Deep work: launch copy',
    list: 'next_actions',
    context: '@computer',
    energy_level: 'high',
    project_id: launchPrep.id,
    due_date: todayStr(),
    scheduled_time: '09:00',
    duration: 90,
    is_daily_focus: 1,
    priority: 4,
  }, userId);

  TaskModel.create({
    title: 'Standup with the design contractor',
    list: 'next_actions',
    context: '@computer',
    project_id: websiteRedesign.id,
    due_date: todayStr(),
    scheduled_time: '11:00',
    duration: 30,
  }, userId);

  TaskModel.create({
    title: 'Lunch + walk',
    list: 'next_actions',
    due_date: todayStr(),
    scheduled_time: '12:30',
    duration: 60,
  }, userId);

  TaskModel.create({
    title: 'Review weekly retro',
    list: 'next_actions',
    context: '@computer',
    due_date: todayStr(),
    scheduled_time: '15:00',
    duration: 45,
  }, userId);

  TaskModel.create({
    title: 'Refi paperwork review',
    list: 'next_actions',
    project_id: homeRefi.id,
    context: '@home',
    due_date: todayStr(1),
    scheduled_time: '10:00',
    duration: 60,
  }, userId);

  // Completed history (today) — gives the dashboard signal
  for (const title of ['Reply to Anna re: Q1 retro', 'Renew SSL cert', 'Move payments off Stripe Radar trial']) {
    TaskModel.create({
      title,
      list: 'completed',
      completed_at: new Date().toISOString(),
    }, userId);
  }

  saveDb();
  console.log('Demo seed complete. Restart the dev server to see it.');
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
