const router = require('express').Router();
const billy = require('../services/billyService');
const { categorizeBillLines, aggregateRevenue } = require('../utils/categorizer');
const { getRangeForPeriod, getPreviousPeriodRange, getPeriodLabel } = require('../utils/dateUtils');
const { formatCurrency, formatPercent } = require('../utils/formatters');
const mapping = require('../config/mapping');

router.get('/', async (req, res) => {
  const period = ['weekly', 'monthly', 'yearly'].includes(req.query.period)
    ? req.query.period
    : 'monthly';
  const tab = ['cafe', 'events', 'b2b'].includes(req.query.tab)
    ? req.query.tab
    : 'cafe';

  if (!process.env.BILLY_API_TOKEN) {
    return res.redirect('/settings?error=no_token');
  }

  const current = getRangeForPeriod(period);
  const previous = getPreviousPeriodRange(period);
  let error = null;

  let accountMap = {};
  let billLines = [], prevBillLines = [];
  let invoices = [], prevInvoices = [];
  let groups = {}, uncategorized = [];
  let prevGroups = {};

  try {
    // Accounts cached; bills+lines and invoices fetched in parallel
    [accountMap, billLines, prevBillLines, invoices, prevInvoices] = await Promise.all([
      billy.getAccounts(),
      billy.getBillsWithLines(current.startDate, current.endDate),
      billy.getBillsWithLines(previous.startDate, previous.endDate),
      billy.getInvoices(current.startDate, current.endDate),
      billy.getInvoices(previous.startDate, previous.endDate),
    ]);

    const curr = categorizeBillLines(billLines, accountMap);
    groups = curr.groups;
    uncategorized = curr.uncategorized;

    const prev = categorizeBillLines(prevBillLines, accountMap);
    prevGroups = prev.groups;

  } catch (err) {
    error = 'Could not connect to Billy API. Check your token in Settings.';
    console.error('Billy API error:', err.message);
    // Initialise empty groups so view doesn't crash
    ['cafe','coffee','admin','accounting','fixed','webshop','other'].forEach(k => {
      const def = mapping.costs[k];
      groups[k] = { label: def.label, icon: def.icon || '📁', total: 0, categories: {} };
      prevGroups[k] = { total: 0, categories: {} };
    });
  }

  // Revenue by stream
  const revenue = aggregateRevenue(invoices, accountMap);
  const prevRevenue = aggregateRevenue(prevInvoices, accountMap);

  // Total costs
  const totalCosts = Object.values(groups).reduce((s, g) => s + g.total, 0);
  const prevTotalCosts = Object.values(prevGroups).reduce((s, g) => s + g.total, 0);

  // Tab-specific revenue
  const tabRevenue = {
    cafe: revenue.cafe,
    events: revenue.events,
    b2b: revenue.b2b_dk + revenue.b2b_eu,
  };
  const prevTabRevenue = {
    cafe: prevRevenue.cafe,
    events: prevRevenue.events,
    b2b: prevRevenue.b2b_dk + prevRevenue.b2b_eu,
  };

  const activeRevenue = tabRevenue[tab] || 0;
  const prevActiveRevenue = prevTabRevenue[tab] || 0;

  // Gross profit (café tab uses all costs; other tabs show shared costs)
  const grossProfit = activeRevenue - totalCosts;
  const prevGrossProfit = prevActiveRevenue - prevTotalCosts;
  const profitMargin = activeRevenue > 0 ? (grossProfit / activeRevenue) * 100 : 0;

  // Trend helper
  function trend(curr, prev) {
    if (curr > prev * 1.005) return 'up';
    if (curr < prev * 0.995) return 'down';
    return 'flat';
  }

  // Cost group delta % vs previous period (for health borders)
  function costDeltaPct(groupKey) {
    const curr = groups[groupKey] ? groups[groupKey].total : 0;
    const prev = prevGroups[groupKey] ? prevGroups[groupKey].total : 0;
    if (prev === 0) return 0;
    return ((curr - prev) / prev) * 100;
  }

  // Waterfall data for chart
  const waterfallData = {
    labels: ['Revenue', ...Object.values(groups).filter(g => g.total > 0).map(g => g.label), 'Gross Profit'],
    values: [activeRevenue, ...Object.values(groups).filter(g => g.total > 0).map(g => -g.total), grossProfit],
  };

  res.render('dashboard', {
    period,
    tab,
    periodLabel: getPeriodLabel(period),
    dateRange: `${current.startDate} — ${current.endDate}`,
    error,
    // Revenue
    revenue, prevRevenue, activeRevenue, prevActiveRevenue,
    tabRevenue,
    revenueTrend: trend(activeRevenue, prevActiveRevenue),
    // Costs
    groups, prevGroups, totalCosts, prevTotalCosts,
    costTrend: trend(totalCosts, prevTotalCosts),
    costDeltaPct,
    // P&L
    grossProfit, prevGrossProfit, profitMargin,
    profitTrend: trend(grossProfit, prevGrossProfit),
    // Uncategorized
    uncategorized,
    allCategories: mapping.allCategories,
    // Waterfall
    waterfallData,
    // Helpers
    formatCurrency, formatPercent,
  });
});

module.exports = router;
