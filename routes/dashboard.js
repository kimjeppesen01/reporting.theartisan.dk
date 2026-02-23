const router = require('express').Router();
const billy = require('../services/billyService');
const { getRangeForPeriod, getPreviousPeriodRange, getPeriodLabel } = require('../utils/dateUtils');
const { formatCurrency, formatPercent } = require('../utils/formatters');

router.get('/', async (req, res) => {
  const period = ['weekly', 'monthly', 'yearly'].includes(req.query.period)
    ? req.query.period
    : 'monthly';

  if (!process.env.BILLY_API_TOKEN) {
    return res.redirect('/settings?error=no_token');
  }

  const current = getRangeForPeriod(period);
  const previous = getPreviousPeriodRange(period);
  let error = null;

  let invoices = [], bills = [], bankPayments = [];
  let prevInvoices = [], prevBills = [];

  try {
    [invoices, bills, bankPayments, prevInvoices, prevBills] = await Promise.all([
      billy.getInvoices(current.startDate, current.endDate),
      billy.getBills(current.startDate, current.endDate),
      billy.getBankPayments(current.startDate, current.endDate),
      billy.getInvoices(previous.startDate, previous.endDate),
      billy.getBills(previous.startDate, previous.endDate)
    ]);
  } catch (err) {
    error = 'Could not connect to Billy API. Check your token in Settings.';
    console.error('Billy API error:', err.message);
  }

  // P&L aggregations
  const totalRevenue = invoices.reduce((s, i) => s + (i.amount || 0), 0);
  const collectedRevenue = invoices.filter(i => i.isPaid).reduce((s, i) => s + (i.amount || 0), 0);
  const outstandingRevenue = totalRevenue - collectedRevenue;

  const totalExpenses = bills.reduce((s, b) => s + (b.amount || 0), 0);
  const paidExpenses = bills.filter(b => b.isPaid).reduce((s, b) => s + (b.amount || 0), 0);
  const outstandingExpenses = totalExpenses - paidExpenses;

  const grossProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // Cashflow
  const cashIn = bankPayments
    .filter(p => p.cashSide === 'debit')
    .reduce((s, p) => s + (p.cashAmount || 0), 0);
  const cashOut = bankPayments
    .filter(p => p.cashSide === 'credit')
    .reduce((s, p) => s + (p.cashAmount || 0), 0);
  const netCashflow = cashIn - cashOut;

  // Trends
  const prevRevenue = prevInvoices.reduce((s, i) => s + (i.amount || 0), 0);
  const prevExpenses = prevBills.reduce((s, b) => s + (b.amount || 0), 0);

  function trend(current, previous) {
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'flat';
  }

  const revenueTrend = trend(totalRevenue, prevRevenue);
  const expenseTrend = trend(totalExpenses, prevExpenses);

  res.render('dashboard', {
    period,
    periodLabel: getPeriodLabel(period),
    dateRange: `${current.startDate} — ${current.endDate}`,
    error,
    totalRevenue, collectedRevenue, outstandingRevenue,
    totalExpenses, paidExpenses, outstandingExpenses,
    grossProfit, profitMargin,
    cashIn, cashOut, netCashflow,
    revenueTrend, expenseTrend,
    formatCurrency, formatPercent
  });
});

module.exports = router;
