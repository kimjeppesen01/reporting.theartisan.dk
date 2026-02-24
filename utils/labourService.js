const path = require('path');
const fs = require('fs');

const LABOUR_PATH = path.join(__dirname, '../data/labour.json');

const DEFAULT_ALLOCATIONS = {
  tabs: { cafe: 25, events: 25, b2b: 25, webshop: 25 },
  roles: {
    cafe:    { Operations: 40, Management: 20, Production: 20, Marketing: 10, Cleaning: 10 },
    events:  { Operations: 40, Planning: 30, Production: 30 },
    b2b:     { Sales: 40, Roasting: 30, Testing: 15, Packaging: 15 },
    webshop: { Development: 60, 'Packaging/Shipping': 40 },
  },
  deduction: 0, // Fixed amount subtracted before tab/role distribution (e.g. another team's salary)
};

function loadAllocations() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LABOUR_PATH, 'utf8'));
    return {
      tabs:  Object.assign({}, DEFAULT_ALLOCATIONS.tabs, parsed.tabs || {}),
      roles: {
        cafe:    Object.assign({}, DEFAULT_ALLOCATIONS.roles.cafe,    (parsed.roles || {}).cafe    || {}),
        events:  Object.assign({}, DEFAULT_ALLOCATIONS.roles.events,  (parsed.roles || {}).events  || {}),
        b2b:     Object.assign({}, DEFAULT_ALLOCATIONS.roles.b2b,     (parsed.roles || {}).b2b     || {}),
        webshop: Object.assign({}, DEFAULT_ALLOCATIONS.roles.webshop, (parsed.roles || {}).webshop || {}),
      },
      deduction: typeof parsed.deduction === 'number' ? parsed.deduction : 0,
    };
  } catch {
    return DEFAULT_ALLOCATIONS;
  }
}

function saveAllocations(allocations) {
  fs.writeFileSync(LABOUR_PATH, JSON.stringify(allocations, null, 2));
}

/**
 * Compute the labour cost group for one tab.
 * Applies deduction first, then distributes the net total by tab/role %.
 * Returns an object in the same shape as other cost groups in categorizer.js:
 *   { label, icon, total, categories: { RoleName: { total, lines[] } } }
 */
function computeLabour(labourTotal, allocations, tab) {
  const deduction    = allocations.deduction || 0;
  const netTotal     = Math.max(0, labourTotal - deduction);
  const tabPct       = (allocations.tabs[tab] || 0) / 100;
  const tabTotal     = netTotal * tabPct;
  const roleMap      = allocations.roles[tab] || {};
  const categories   = {};

  Object.entries(roleMap).forEach(([roleName, rolePct]) => {
    const roleAmount = tabTotal * (rolePct / 100);
    if (roleAmount > 0) {
      categories[roleName] = {
        total: roleAmount,
        lines: [{ id: 'labour-' + tab + '-' + roleName, supplierName: 'Labour allocation', amount: roleAmount, date: '' }],
      };
    }
  });

  return { label: 'Labour', icon: '👥', total: tabTotal, categories };
}

module.exports = { loadAllocations, saveAllocations, computeLabour, DEFAULT_ALLOCATIONS };
