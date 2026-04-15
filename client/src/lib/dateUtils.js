export function formatDateKey(date) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return formatDateKey(d);
}

export function isOverdue(dateStr) {
  if (!dateStr) return false;
  return dateStr < formatDateKey(new Date());
}

export function getMonthName(month) {
  const names = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return names[month];
}

export function getShortMonthName(month) {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[month];
}

export function getDayNames() {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
}

export function getMonthDays(year, month) {
  const today = formatDateKey(new Date());
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0=Sun
  const startDate = new Date(year, month, 1 - startOffset);

  const lastDay = new Date(year, month + 1, 0);
  const endOffset = 6 - lastDay.getDay();
  const totalDays = startOffset + lastDay.getDate() + endOffset;

  const days = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateKey = formatDateKey(d);
    days.push({
      date: dateKey,
      day: d.getDate(),
      isCurrentMonth: d.getMonth() === month,
      isToday: dateKey === today,
    });
  }
  return days;
}

export function getWeekDays(baseDate) {
  const today = formatDateKey(new Date());
  const d = typeof baseDate === 'string' ? new Date(baseDate + 'T00:00:00') : new Date(baseDate);
  const dayOfWeek = d.getDay();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - dayOfWeek);

  const dayNames = getDayNames();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(sunday);
    current.setDate(sunday.getDate() + i);
    const dateKey = formatDateKey(current);
    days.push({
      date: dateKey,
      day: current.getDate(),
      dayName: dayNames[i],
      isToday: dateKey === today,
    });
  }
  return days;
}

export function getDateRangeForView(viewType, currentDate) {
  const d = typeof currentDate === 'string' ? new Date(currentDate + 'T00:00:00') : new Date(currentDate);

  if (viewType === 'month') {
    const year = d.getFullYear();
    const month = d.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const startDate = new Date(year, month, 1 - startOffset);
    const lastDay = new Date(year, month + 1, 0);
    const endOffset = 6 - lastDay.getDay();
    const endDate = new Date(lastDay);
    endDate.setDate(lastDay.getDate() + endOffset);
    return { start: formatDateKey(startDate), end: formatDateKey(endDate) };
  }

  if (viewType === 'week') {
    const dayOfWeek = d.getDay();
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - dayOfWeek);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    return { start: formatDateKey(sunday), end: formatDateKey(saturday) };
  }

  // day
  const dateKey = formatDateKey(d);
  return { start: dateKey, end: dateKey };
}
