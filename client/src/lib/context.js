// Contexts are stored "@"-prefixed (the POST /api/contexts route enforces it,
// and the default contexts are seeded that way). Some render sites prepended a
// second "@" (showing "@@home"), while AI-written task contexts can arrive bare.
// This normalizes any form — "@home", "home", "@@home" — to a single "@home"
// so every surface renders contexts identically.
export function contextLabel(name) {
  if (!name) return '';
  return '@' + String(name).replace(/^@+/, '');
}
