const router = require('express').Router();
const billy  = require('../services/billyService');
const { loadAllocations } = require('../utils/labourService');
const { getRangeForPeriod } = require('../utils/dateUtils');
const { formatCurrency } = require('../utils/formatters');
const mapping = require('../config/mapping');

// GET /labour — render allocation editor
router.get('/', async (req, res) => {
  const period = ['weekly', 'monthly', 'yearly'].includes(req.query.period)
    ? req.query.period
    : 'monthly';

  if (!process.env.BILLY_API_TOKEN) {
    return res.redirect('/settings?error=no_token');
  }

  let labourTotal = 0;
  let error = null;

  try {
    const current = getRangeForPeriod(period);
    const [accountMap, billLines, daybookLines] = await Promise.all([
      billy.getAccounts(),
      billy.getBillsWithLines(current.startDate, current.endDate),
      billy.getDaybookLinesForRevenue(current.startDate, current.endDate),
    ]);

    const prefix = mapping.labour.accountPrefix;
    const labourAccIds = new Set(
      Object.entries(accountMap)
        .filter(([code]) => code.startsWith(prefix))
        .map(([, acc]) => acc.id)
    );
    billLines.forEach(line => {
      if (labourAccIds.has(line.accountId)) labourTotal += (line.amount || 0);
    });
    daybookLines.forEach(line => {
      if (labourAccIds.has(line.accountId) && line.side === 'debit') labourTotal += (line.amount || 0);
    });
  } catch (err) {
    error = 'Could not load salary data from Billy.';
    console.error('Labour route error:', err.message);
  }

  res.render('labour', {
    period,
    labourTotal,
    allocations: loadAllocations(),
    labourConfig: mapping.labour,
    error,
    saved: req.query.saved === '1',
    formatCurrency,
  });
});

module.exports = router;
