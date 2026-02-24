const router = require('express').Router();
const billy = require('../services/billyService');
const { categorizeBillLines, aggregateRevenue } = require('../utils/categorizer');
const { loadAllocations, computeLabour } = require('../utils/labourService');
const { getRangeForPeriod, getPreviousPeriodRange, getPeriodLabel } = require('../utils/dateUtils');
const { formatCurrency, formatPercent } = require('../utils/formatters');
const mapping = require('../config/mapping');

/**
 * Bucket cashflow by time granularity:
 *   weekly  → 7 daily buckets (Mon–Sun)
 *   monthly → 5 weekly buckets (Wk 1–5)
 *   yearly  → 12 monthly buckets (Jan–Dec)
 * Returns { labels[], inflow[], outflow[], net[] }
 */
function bucketCashflow(period, daybookLines, billLines, invoices, accountMap) {
  const revenueAccIds = new Set(
    Object.values(mapping.revenue)
      .map(code => accountMap[code] ? accountMap[code].id : null)
      .filter(Boolean)
  );

  let n, labels, getBucket;
  if (period === 'weekly') {
    n = 7;
    labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    getBucket = s => { const d = new Date(s).getDay(); return d === 0 ? 6 : d - 1; };
  } else if (period === 'monthly') {
    n = 5;
    labels = ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5'];
    getBucket = s => Math.min(Math.floor((new Date(s).getDate() - 1) / 7), 4);
  } else {
    n = 12;
    labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    getBucket = s => new Date(s).getMonth();
  }

  const inflow = Array(n).fill(0);
  const outflow = Array(n).fill(0);

  daybookLines.forEach(l => {
    if (l.side !== 'credit' || !revenueAccIds.has(l.accountId) || !l.date) return;
    const b = getBucket(l.date);
    if (b >= 0 && b < n) inflow[b] += l.amount;
  });

  invoices.forEach(inv => {
    const d = (inv.entryDate || inv.createdTime || '').slice(0, 10);
    if (!d) return;
    const b = getBucket(d);
    if (b >= 0 && b < n) inflow[b] += (inv.amount || 0);
  });

  billLines.forEach(l => {
    if (!l.date) return;
    const b = getBucket(l.date);
    if (b >= 0 && b < n) outflow[b] += l.amount;
  });

  return { labels, inflow, outflow, net: inflow.map((v, i) => v - outflow[i]) };
}

router.get('/', async (req, res) => {
  const period = ['weekly', 'monthly', 'yearly'].includes(req.query.period)
    ? req.query.period
    : 'monthly';
  const tab = ['cafe', 'events', 'b2b', 'webshop'].includes(req.query.tab)
    ? req.query.tab
    : 'cafe';
  // offset: 0 = current period, -1 = prev, -2 = two ago, etc. Block future periods.
  const offset = Math.min(0, parseInt(req.query.offset) || 0);

  if (!process.env.BILLY_API_TOKEN) {
    return res.redirect('/settings?error=no_token');
  }

  const current = getRangeForPeriod(period, offset);
  const previous = getPreviousPeriodRange(period, offset);
  let error = null;

  let accountMap = {};
  let billLines = [], prevBillLines = [];
  let daybookLines = [], prevDaybookLines = [];
  let invoices = [], prevInvoices = [];
  let groups = {}, uncategorized = [];
  let prevGroups = {};
  let labourProjected = null;

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

    // Extract all 14xx (labour/payroll) account totals — from bills AND daybook journal entries
    // (Danish payroll is often posted as a daybook debit on 14xx accounts, not a vendor bill)
    const labourPrefix = mapping.labour.accountPrefix;
    const labourAccIds = new Set(
      Object.entries(accountMap)
        .filter(([code]) => code.startsWith(labourPrefix))
        .map(([, acc]) => acc.id)
    );
    let labourTotal = 0, prevLabourTotal = 0;
    billLines.forEach(l => { if (labourAccIds.has(l.accountId)) labourTotal += (l.amount || 0); });
    prevBillLines.forEach(l => { if (labourAccIds.has(l.accountId)) prevLabourTotal += (l.amount || 0); });
    // Daybook journal entries: debit side on 14xx = salary expense
    daybookLines.forEach(l => { if (labourAccIds.has(l.accountId) && l.side === 'debit') labourTotal += (l.amount || 0); });
    prevDaybookLines.forEach(l => { if (labourAccIds.has(l.accountId) && l.side === 'debit') prevLabourTotal += (l.amount || 0); });

    // Compute labour cost group per tab using saved allocations
    const labourAlloc = loadAllocations();
    groups.labour     = computeLabour(labourTotal,     labourAlloc, tab);
    prevGroups.labour = computeLabour(prevLabourTotal, labourAlloc, tab);
    // Store gross/net/deduction for display in the Labour card
    groups.labour._rawTotal  = labourTotal;
    groups.labour._deduction = labourAlloc.deduction || 0;
    groups.labour._netTotal  = Math.max(0, labourTotal - (labourAlloc.deduction || 0));

    // Salary projection: for current month only, use last month's 14xx total as projected full-month value
    labourProjected = (period === 'monthly' && offset === 0) ? prevLabourTotal : null;

  } catch (err) {
    error = 'Could not connect to Billy API. Check your token in Settings.';
    console.error('Billy API error:', err.message);
    // Initialise empty groups so view doesn't crash
    ['cafe','coffee','admin','accounting','fixed','webshop','other'].forEach(k => {
      const def = mapping.costs[k];
      groups[k] = { label: def.label, icon: def.icon || '📁', total: 0, categories: {} };
      prevGroups[k] = { total: 0, categories: {} };
    });
    groups.labour     = { label: 'Labour', icon: '👥', total: 0, categories: {}, _rawTotal: 0 };
    prevGroups.labour = { label: 'Labour', icon: '👥', total: 0, categories: {}, _rawTotal: 0 };
  }

  // Revenue: café from daybook (1111 credits), B2B from invoice totals
  const revenue = aggregateRevenue(daybookLines, invoices, accountMap);
  const prevRevenue = aggregateRevenue(prevDaybookLines, prevInvoices, accountMap);

  // Cost groups shown per tab
  const tabCostGroups = {
    cafe:    ['cafe', 'coffee', 'admin', 'accounting', 'fixed', 'labour', 'other'],
    events:  ['labour'],
    b2b:     ['admin', 'fixed', 'labour'],
    webshop: ['webshop', 'labour'],
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

  // Cashflow timeline — bucketed by period granularity (business-wide, not tab-specific)
  const cashflowTimeline = bucketCashflow(period, daybookLines, billLines, invoices, accountMap);
  const cfInTotal  = cashflowTimeline.inflow.reduce((a, b) => a + b, 0);
  const cfOutTotal = cashflowTimeline.outflow.reduce((a, b) => a + b, 0);
  const startD = new Date(current.startDate);
  const endD   = new Date(current.endDate);
  const daysInPeriod = Math.ceil((endD - startD) / 86400000) + 1;
  const cashflowKpis = {
    totalInflow:  cfInTotal,
    totalOutflow: cfOutTotal,
    netCF:        cfInTotal - cfOutTotal,
    dailyBurn:    daysInPeriod > 0 ? cfOutTotal / daysInPeriod : 0,
  };

  res.render('dashboard', {
    period,
    tab,
    periodLabel: getPeriodLabel(period, offset),
    offset,
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
    // Cashflow Command Center
    cashflowTimeline,
    cashflowKpis,
    // Labour projection
    labourProjected,
    // Helpers
    formatCurrency, formatPercent,
  });
});

module.exports = router;
