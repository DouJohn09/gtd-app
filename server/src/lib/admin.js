// Founder-only pages (Pulse). Admins are the emails in ADMIN_EMAILS
// (comma-separated), falling back to FOUNDER_NOTIFY_EMAIL so a single-founder
// setup needs no extra config. Unset both → nobody is an admin.
export function isAdminEmail(email) {
  const list = (process.env.ADMIN_EMAILS || process.env.FOUNDER_NOTIFY_EMAIL || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(String(email).toLowerCase());
}

// Founder/team accounts left out of every stat (STATS_EXCLUDE_EMAILS) plus the
// admins. The client marks such a browser so the landing page stops tracking it.
export function isInternalEmail(email) {
  const list = (process.env.STATS_EXCLUDE_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return isAdminEmail(email) || (!!email && list.includes(String(email).toLowerCase()));
}

export function requireAdmin(req, res, next) {
  if (!isAdminEmail(req.user?.email)) return res.status(404).json({ error: 'Not found' });
  next();
}
