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
  const tab = ['cafe', 'events', 'b2b', 'webshop'].includes(req.query.tab)
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
  let daybookLines = [], prevDaybookLines = [];
  let invoices = [], prevInvoices = [];
  let groups = {}, uncategorized = [];
  let prevGroups = {};

  try {
    // Fetch all data in parallel
    [accountMap, billLines, prevBillLines, daybookLines, prevDaybookLines, invoices, prevInvoices] = await Promise.all([
      billy.getAccounts(),
      billy.getBillsWithLines(current.startDate, current.endDate),
      billy.getBillsWithLines(previous.startDate, previous.endDate),
      billy.getDaybookLinesForRevenue(current.startDate, current.endDate),
      billy.getDaybookLinesForRevenue(previous.startDate, previous.endDate),
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

  // Revenue: café from daybook (1111 credits), B2B from invoice totals
  const revenue = aggregateRevenue(daybookLines, invoices, accountMap);
  const prevRevenue = aggregateRevenue(prevDaybookLines, prevInvoices, accountMap);

  // Cost groups shown per tab
  const tabCostGroups = {
    cafe:    ['cafe', 'coffee', 'admin', 'accounting', 'fixed', 'other'],
    events:  [],
    b2b:     ['admin', 'fixed'],
    webshop: ['webshop'],
  };
  const activeCostKeys = tabCostGroups[tab] || [];

  // Tab-specific revenue
  const tabRevenue = {
    cafe:    revenue.cafe,
    events:  revenue.events,
    b2b:     revenue.b2b_dk + revenue.b2b_eu,
    webshop: revenue.webshop,
  };
  const prevTabRevenue = {
    cafe:    prevRevenue.cafe,
    events:  prevRevenue.events,
    b2b:     prevRevenue.b2b_dk + prevRevenue.b2b_eu,
    webshop: prevRevenue.webshop,
  };

  const activeRevenue = tabRevenue[tab] || 0;
  const prevActiveRevenue = prevTabRevenue[tab] || 0;

  // Tab-specific costs (only the groups that belong to this tab)
  const totalCosts = activeCostKeys.reduce((s, k) => s + (groups[k] ? groups[k].total : 0), 0);
  const prevTotalCosts = activeCostKeys.reduce((s, k) => s + (prevGroups[k] ? prevGroups[k].total : 0), 0);

  // Gross profit
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

  // Waterfall data — only the cost groups for this tab
  const activeGroups = activeCostKeys.map(k => groups[k]).filter(g => g && g.total > 0);
  const waterfallData = {
    labels: ['Revenue', ...activeGroups.map(g => g.label), 'Gross Profit'],
    values: [activeRevenue, ...activeGroups.map(g => -g.total), grossProfit],
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
    activeCostKeys,
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
