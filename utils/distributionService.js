const path = require('path');
const fs = require('fs');

const DIST_PATH = path.join(__dirname, '../data/distributions.json');

function loadDistributions() {
  try {
    return JSON.parse(fs.readFileSync(DIST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveDistribution(key, months) {
  const data = loadDistributions();
  if (!months || months <= 1) {
    delete data[key];
  } else {
    data[key] = { months: Math.max(2, Math.min(24, Number(months))) };
  }
  fs.writeFileSync(DIST_PATH, JSON.stringify(data, null, 2));
}

/**
 * Returns the YYYY-MM key that is `offset` months from `baseKey`.
 * offset = -1 → previous month, -2 → two months ago, etc.
 */
function monthKeyOffset(baseKey, offset) {
  const [y, m] = baseKey.split('-').map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Apply distribution rules to cost groups in-place.
 *
 * @param {Object} groups          - Current period cost groups (mutated in-place)
 * @param {Object} distributions   - { "groupKey:catName": { months } }
 * @param {Object} historicalGroups - { "YYYY-MM": categorized groups } for previous months
 * @param {string} currentMonthKey - "YYYY-MM" of the current period
 */
function applyDistributions(groups, distributions, historicalGroups, currentMonthKey) {
  if (!Object.keys(distributions).length) return;

  Object.entries(groups).forEach(([groupKey, group]) => {
    if (groupKey === 'labour') return; // labour has its own system
    if (!group || !group.categories) return;

    let groupTotalChanged = false;

    Object.entries(group.categories).forEach(([catName, catData]) => {
      const distKey = `${groupKey}:${catName}`;
      const dist = distributions[distKey];
      if (!dist || dist.months <= 1) return;

      const months = dist.months;

      // Current month's bills: only count 1/months of each
      const newLines = catData.lines.map(l => ({
        ...l,
        amount: l.amount / months,
        _distributed: false,
      }));
      let newTotal = catData.total / months;

      // Carry-over from previous months (up to months-1 previous months)
      let hasCarryOver = false;
      for (let i = 1; i < months; i++) {
        const histKey = monthKeyOffset(currentMonthKey, -i);
        const histGroup = historicalGroups && historicalGroups[histKey];
        if (!histGroup || !histGroup[groupKey]) continue;
        const histCat = histGroup[groupKey].categories && histGroup[groupKey].categories[catName];
        if (!histCat) continue;

        const histShare = histCat.total / months;
        newTotal += histShare;
        histCat.lines.forEach(l => {
          newLines.push({ ...l, amount: l.amount / months, _distributed: true });
        });
        hasCarryOver = true;
      }

      group.categories[catName] = {
        total: newTotal,
        lines: newLines,
        _months: months,
        _hasCarryOver: hasCarryOver,
      };
      groupTotalChanged = true;
    });

    if (groupTotalChanged) {
      group.total = Object.values(group.categories).reduce((s, c) => s + c.total, 0);
    }
  });
}

module.exports = { loadDistributions, saveDistribution, applyDistributions, monthKeyOffset };
