#!/usr/bin/env node
// Seed a curated, privacy-safe demo account for landing-page screenshots and the
// demo video. Creates/refreshes a dedicated user (google_id 'demo-seed', email
// demo@cleartable.app) and NEVER touches real accounts. All content is fictional.
//
//   node server/scripts/seed-demo.js
//
// To view it in a browser without Google OAuth (for screenshots), mint a JWT for
// the printed user id and inject it into localStorage:
//   node -e 'import("./src/env.js").then(async()=>{const j=(await import("jsonwebtoken")).default;
//     console.log(j.sign({userId:<ID>,email:"demo@cleartable.app"},process.env.JWT_SECRET,{expiresIn:"1d"}))})'
//   then in the app origin: localStorage.setItem('token', '<jwt>')
//
// Contexts are stored "@"-prefixed to match the app's convention (POST
// /api/contexts enforces it); contextLabel() renders them as a single "@name".

import '../src/env.js';
import { pool } from '../src/db/pool.js';

const d = (off = 0) => { const x = new Date(); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };

async function main() {
  let { rows } = await pool.query("SELECT id FROM users WHERE google_id = 'demo-seed'");
  let uid;
  if (rows[0]) {
    uid = rows[0].id;
    for (const t of ['tasks', 'habit_logs', 'habits', 'projects', 'contexts']) {
      await pool.query(`DELETE FROM ${t} WHERE user_id = $1`, [uid]);
    }
  } else {
    ({ rows } = await pool.query(
      "INSERT INTO users (google_id, email, name, timezone) VALUES ('demo-seed','demo@cleartable.app','Alex Rivera','Europe/Prague') RETURNING id"));
    uid = rows[0].id;
  }

  for (const c of ['@work', '@personal', '@home', '@errands', '@calls']) {
    await pool.query('INSERT INTO contexts (name, user_id) VALUES ($1,$2)', [c, uid]);
  }

  const proj = {};
  for (const [name, desc, mode, status] of [
    ['Q3 Product Launch', 'Ship the new onboarding flow and announce it', 'sequential', 'active'],
    ['Home Renovation', 'Kitchen refresh before the holidays', 'parallel', 'active'],
    ['Marketing Site Refresh', 'New landing page + 3 blog posts', 'parallel', 'active'],
    ['Learn Watercolor', 'One small painting a week', 'parallel', 'on_hold'],
  ]) {
    const { rows: r } = await pool.query(
      'INSERT INTO projects (name, description, execution_mode, status, user_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name, desc, mode, status, uid]);
    proj[name] = r[0].id;
  }

  const T = (t) => pool.query(
    `INSERT INTO tasks (title, notes, list, context, project_id, waiting_for_person, due_date, start_date,
       scheduled_time, duration, energy_level, time_estimate, priority, is_daily_focus, position, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [t.title, t.notes ?? null, t.list, t.context ?? null, t.project_id ?? null, t.waiting_for_person ?? null,
     t.due_date ?? null, t.start_date ?? null, t.scheduled_time ?? null, t.duration ?? null,
     t.energy_level ?? null, t.time_estimate ?? null, t.priority ?? 0, !!t.is_daily_focus, t.position ?? 0, uid]);

  // Inbox — unprocessed captures
  await T({ title: 'Book dentist — overdue for a cleaning', list: 'inbox' });
  await T({ title: 'Idea: weekend hiking trip with the team', list: 'inbox' });
  await T({ title: 'Reply to Sarah about the venue booking', list: 'inbox' });
  await T({ title: 'Renew car insurance before it lapses', list: 'inbox' });
  await T({ title: 'Research standing desks', list: 'inbox' });

  // Next actions
  await T({ title: 'Draft Q3 planning doc', list: 'next_actions', context: '@work', project_id: proj['Q3 Product Launch'], position: 0, energy_level: 'high', time_estimate: 60, priority: 3, due_date: d(0), is_daily_focus: true });
  await T({ title: 'Review pull request from Alex', list: 'next_actions', context: '@work', energy_level: 'medium', time_estimate: 30, priority: 2, due_date: d(0), is_daily_focus: true });
  await T({ title: 'Prep notes for Monday standup', list: 'next_actions', context: '@work', energy_level: 'low', time_estimate: 15, priority: 1 });
  await T({ title: 'Write blog post: “How to run a weekly review”', list: 'next_actions', context: '@work', project_id: proj['Marketing Site Refresh'], energy_level: 'high', time_estimate: 90, priority: 2, due_date: d(1) });
  await T({ title: 'Pick up dry cleaning', list: 'next_actions', context: '@errands', energy_level: 'low', time_estimate: 15 });
  await T({ title: 'Buy birthday gift for Mom', list: 'next_actions', context: '@errands', priority: 2, due_date: d(2) });
  await T({ title: 'Water the plants', list: 'next_actions', context: '@home', energy_level: 'low', time_estimate: 5, due_date: d(0), is_daily_focus: true });
  await T({ title: 'Call the accountant about taxes', list: 'next_actions', context: '@calls', priority: 3, time_estimate: 20 });
  await T({ title: 'Order new tiles for the kitchen', list: 'next_actions', context: '@home', project_id: proj['Home Renovation'], priority: 2 });

  // Waiting for
  await T({ title: 'Feedback on the proposal', list: 'waiting_for', waiting_for_person: 'Jordan', due_date: d(3) });
  await T({ title: 'Contractor quote for the kitchen', list: 'waiting_for', waiting_for_person: 'Miguel', project_id: proj['Home Renovation'] });

  // Someday / maybe
  await T({ title: 'Learn conversational Spanish', list: 'someday_maybe' });
  await T({ title: 'Plan a trip to Japan', list: 'someday_maybe' });

  // Calendar — time-blocked today
  await T({ title: 'Deep work: Q3 planning doc', list: 'next_actions', context: '@work', due_date: d(0), scheduled_time: '09:00', duration: 90, energy_level: 'high' });
  await T({ title: 'Team sync', list: 'next_actions', context: '@work', due_date: d(0), scheduled_time: '11:00', duration: 30 });
  await T({ title: 'Lunch walk', list: 'next_actions', context: '@personal', due_date: d(0), scheduled_time: '13:00', duration: 45 });
  await T({ title: 'Review PRs + inbox', list: 'next_actions', context: '@work', due_date: d(0), scheduled_time: '15:00', duration: 60 });
  await T({ title: 'Evening run', list: 'next_actions', context: '@personal', due_date: d(0), scheduled_time: '18:30', duration: 45, energy_level: 'medium' });

  // Habits + logs (streaks / heatmap)
  const habits = [
    ['Morning meditation', 'daily', null, 'Mind', '#a78bfa'],
    ['Read 20 pages', 'daily', null, 'Growth', '#34d399'],
    ['Exercise', 'specific_days', JSON.stringify(['mon', 'wed', 'fri']), 'Health', '#fbbf24'],
  ];
  for (const [name, freq, target, cat, color] of habits) {
    const { rows: hr } = await pool.query(
      'INSERT INTO habits (name, frequency, target_days, category, color, active, type, user_id) VALUES ($1,$2,$3,$4,$5,true,$6,$7) RETURNING id',
      [name, freq, target, cat, color, 'build', uid]);
    const hid = hr[0].id;
    for (let off = -45; off <= 0; off++) {
      const date = new Date(); date.setDate(date.getDate() + off);
      const isDue = freq === 'daily' || [1, 3, 5].includes(date.getDay());
      if (!isDue) continue;
      await pool.query(
        'INSERT INTO habit_logs (habit_id, completed_date, status, user_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [hid, date.toISOString().slice(0, 10), 'done', uid]);
    }
  }

  console.log(`Seeded demo user id=${uid} (demo@cleartable.app). Mint a JWT for this id to view without OAuth.`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
