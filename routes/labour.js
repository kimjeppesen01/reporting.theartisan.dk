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
    const [accountMap, billLines] = await Promise.all([
      billy.getAccounts(),
      billy.getBillsWithLines(current.startDate, current.endDate),
    ]);

    const labourAcc = accountMap[mapping.labour.account];
    if (labourAcc) {
      billLines.forEach(line => {
        if (line.accountId === labourAcc.id) labourTotal += (line.amount || 0);
      });
    }
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
