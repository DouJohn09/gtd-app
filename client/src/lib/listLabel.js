// Canonical display names for the GTD lists. Every badge/chip render site
// shares this so "someday_maybe" never leaks as lowercase "someday maybe"
// (or "Someday / Maybe" with stray spaces) in the UI.
const LIST_LABELS = {
  inbox: 'Inbox',
  next_actions: 'Next Actions',
  waiting_for: 'Waiting For',
  someday_maybe: 'Someday/Maybe',
  completed: 'Completed',
  calendar: 'Calendar',
};

export function listLabel(list) {
  if (!list) return '';
  return LIST_LABELS[list] || list.replace(/_/g, ' ');
}
