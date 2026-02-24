function pad(n) {
  return String(n).padStart(2, '0');
}

function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// offset 0 = current, -1 = previous, -2 = two ago, etc.
function getWeeklyRange(offset) {
  offset = offset || 0;
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { startDate: fmt(monday), endDate: fmt(sunday) };
}

function getMonthlyRange(offset) {
  offset = offset || 0;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { startDate: fmt(start), endDate: fmt(end) };
}

function getYearlyRange(offset) {
  offset = offset || 0;
  const y = new Date().getFullYear() + offset;
  return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
}

function getRangeForPeriod(period, offset) {
  offset = offset || 0;
  if (period === 'weekly') return getWeeklyRange(offset);
  if (period === 'yearly') return getYearlyRange(offset);
  return getMonthlyRange(offset);
}

function getPreviousPeriodRange(period, offset) {
  return getRangeForPeriod(period, (offset || 0) - 1);
}

function getPeriodLabel(period, offset) {
  offset = offset || 0;
  if (offset === 0) {
    if (period === 'weekly') return 'This Week';
    if (period === 'yearly') return 'This Year';
    return 'This Month';
  }
  if (offset === -1) {
    if (period === 'weekly') return 'Last Week';
    if (period === 'yearly') return 'Last Year';
    return 'Last Month';
  }
  // Older periods: show human-readable label
  const range = getRangeForPeriod(period, offset);
  if (period === 'weekly') {
    return `Week of ${range.startDate}`;
  }
  if (period === 'monthly') {
    const d = new Date(range.startDate + 'T00:00:00');
    return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  }
  // yearly
  return range.startDate.slice(0, 4);
}

module.exports = {
  getWeeklyRange,
  getMonthlyRange,
  getYearlyRange,
  getPreviousPeriodRange,
  getRangeForPeriod,
  getPeriodLabel
};
