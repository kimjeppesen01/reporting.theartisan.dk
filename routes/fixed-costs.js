const router = require('express').Router();
const billy  = require('../services/billyService');
const { categorizeBillLines } = require('../utils/categorizer');
const { loadFixedAlloc }      = require('../utils/fixedCostsService');
const { formatCurrency }      = require('../utils/formatters');

function getMonthRange(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 0);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { startDate: fmt(start), endDate: fmt(end) };
}

function buildMonthNav(currentKey) {
  const [cy, cm] = currentKey.split('-').map(Number);
  const now    = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const months = [];
  for (let i = -4; i <= 1; i++) {
    const d   = new Date(cy, cm - 1 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key > nowKey) continue;
    months.push({
      key,
      label:  d.toLocaleString('en-GB', { month: 'short', year: 'numeric' }),
      active: key === currentKey,
    });
  }
  return months;
}

// GET /fixed-costs — render allocation editor
router.get('/', async (req, res) => {
  if (!process.env.BILLY_API_TOKEN) {
    return res.redirect('/settings?error=no_token');
  }

  const now          = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthKey     = /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : defaultMonth;

  let fixedTotal      = 0;
  let fixedCategories = {};
  let error = null;

  try {
    const range = getMonthRange(monthKey);
    const [accountMap, billLines] = await Promise.all([
      billy.getAccounts(),
      billy.getBillsWithLines(range.startDate, range.endDate),
    ]);
    const { groups } = categorizeBillLines(billLines, accountMap);
    const fg = groups.fixed || { total: 0, categories: {} };
    fixedTotal      = fg.total;
    fixedCategories = fg.categories;
  } catch (err) {
    error = 'Could not load fixed cost data from Billy.';
    console.error('Fixed costs route error:', err.message);
  }

  const alloc = loadFixedAlloc(monthKey);
  res.render('fixed-costs', {
    monthKey,
    monthNav: buildMonthNav(monthKey),
    fixedTotal,
    fixedCategories,
    alloc,
    error,
    saved: req.query.saved === '1',
    formatCurrency,
  });
});

module.exports = router;
