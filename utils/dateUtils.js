function pad(n) {
  return String(n).padStart(2, '0');
}

function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getWeeklyRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { startDate: fmt(monday), endDate: fmt(sunday) };
}

function getMonthlyRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { startDate: fmt(start), endDate: fmt(end) };
}

function getYearlyRange() {
  const y = new Date().getFullYear();
  return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
}

function getPreviousPeriodRange(period) {
  const now = new Date();

  if (period === 'weekly') {
    const day = now.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMon - 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { startDate: fmt(monday), endDate: fmt(sunday) };
  }

  if (period === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { startDate: fmt(start), endDate: fmt(end) };
  }

  // yearly
  const y = now.getFullYear() - 1;
  return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
}

function getRangeForPeriod(period) {
  if (period === 'weekly') return getWeeklyRange();
  if (period === 'yearly') return getYearlyRange();
  return getMonthlyRange();
}

function getPeriodLabel(period) {
  if (period === 'weekly') return 'This Week';
  if (period === 'yearly') return 'This Year';
  return 'This Month';
}

module.exports = {
  getWeeklyRange,
  getMonthlyRange,
  getYearlyRange,
  getPreviousPeriodRange,
  getRangeForPeriod,
  getPeriodLabel
};
