const path = require('path');
const fs = require('fs');

const FIXED_PATH = path.join(__dirname, '../data/fixed-costs.json');

const DEFAULT_TABS = { cafe: 90, events: 0, b2b: 10, webshop: 0 };

function loadData() {
  try {
    const raw = JSON.parse(fs.readFileSync(FIXED_PATH, 'utf8'));
    return raw.default ? raw : { default: { tabs: DEFAULT_TABS }, months: {} };
  } catch {
    return { default: { tabs: DEFAULT_TABS }, months: {} };
  }
}

/**
 * Load fixed cost allocation for a specific month (YYYY-MM) or the default.
 */
function loadFixedAlloc(monthKey) {
  const data = loadData();
  const base = (data.default && data.default.tabs) ? data.default.tabs : DEFAULT_TABS;
  if (monthKey && data.months && data.months[monthKey] && data.months[monthKey].tabs) {
    return { tabs: Object.assign({}, DEFAULT_TABS, base, data.months[monthKey].tabs) };
  }
  return { tabs: Object.assign({}, DEFAULT_TABS, base) };
}

/**
 * Save fixed cost allocation to a specific month or to the default.
 */
function saveFixedAlloc(alloc, monthKey) {
  const data = loadData();
  if (monthKey) {
    if (!data.months) data.months = {};
    data.months[monthKey] = alloc;
  } else {
    data.default = alloc;
  }
  fs.writeFileSync(FIXED_PATH, JSON.stringify(data, null, 2));
}

/**
 * Apply stream allocation percentage to a raw fixed cost group.
 * Returns a new group object with scaled totals and line amounts.
 */
function computeFixedCosts(fixedGroup, alloc, tab) {
  if (!fixedGroup || !fixedGroup.total) {
    return { label: 'Fixed Costs', icon: '🏠', total: 0, categories: {}, _rawTotal: 0, _tabPct: 0 };
  }
  const pct = (alloc.tabs[tab] || 0) / 100;
  const categories = {};
  Object.entries(fixedGroup.categories).forEach(([name, data]) => {
    const catTotal = data.total * pct;
    if (catTotal > 0) {
      categories[name] = {
        total: catTotal,
        lines: data.lines.map(l => ({ ...l, amount: l.amount * pct })),
      };
    }
  });
  return {
    label:     fixedGroup.label,
    icon:      fixedGroup.icon,
    total:     fixedGroup.total * pct,
    categories,
    _rawTotal: fixedGroup.total,
    _tabPct:   pct,
  };
}

module.exports = { loadFixedAlloc, saveFixedAlloc, computeFixedCosts };
