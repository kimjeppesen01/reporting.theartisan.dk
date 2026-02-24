const path = require('path');
const fs = require('fs');

const LABOUR_PATH = path.join(__dirname, '../data/labour.json');

const DEFAULT_TABS  = { cafe: 90, events: 0, b2b: 10, webshop: 0 };
const DEFAULT_ROLES = {
  cafe:    { Operations: 40, Management: 20, Production: 20, Marketing: 10, Cleaning: 10 },
  events:  { Operations: 40, Planning: 30, Production: 30 },
  b2b:     { Sales: 40, Roasting: 30, Testing: 15, Packaging: 15 },
  webshop: { Development: 60, 'Packaging/Shipping': 40 },
};

function loadData() {
  try {
    const raw = JSON.parse(fs.readFileSync(LABOUR_PATH, 'utf8'));
    // Migrate old flat format → new { default, months } format
    if (raw.default) return raw;
    return {
      default: {
        tabs:      raw.tabs      || DEFAULT_TABS,
        roles:     raw.roles     || DEFAULT_ROLES,
        deduction: raw.deduction || 0,
      },
      months: {},
    };
  } catch {
    return { default: { tabs: DEFAULT_TABS, roles: DEFAULT_ROLES, deduction: 0 }, months: {} };
  }
}

function mergeWithDefaults(src) {
  const s = src || {};
  return {
    tabs: Object.assign({}, DEFAULT_TABS, s.tabs || {}),
    roles: {
      cafe:    Object.assign({}, DEFAULT_ROLES.cafe,    (s.roles || {}).cafe    || {}),
      events:  Object.assign({}, DEFAULT_ROLES.events,  (s.roles || {}).events  || {}),
      b2b:     Object.assign({}, DEFAULT_ROLES.b2b,     (s.roles || {}).b2b     || {}),
      webshop: Object.assign({}, DEFAULT_ROLES.webshop, (s.roles || {}).webshop || {}),
    },
    deduction: typeof s.deduction === 'number' ? s.deduction : 0,
  };
}

/**
 * Load allocations for a specific month (YYYY-MM) or the default.
 * Month-specific settings take precedence over default when present.
 */
function loadAllocations(monthKey) {
  const data = loadData();
  if (monthKey && data.months && data.months[monthKey]) {
    return mergeWithDefaults(data.months[monthKey]);
  }
  return mergeWithDefaults(data.default);
}

/**
 * Save allocations to a specific month or to the default block.
 */
function saveAllocations(allocations, monthKey) {
  const data = loadData();
  if (monthKey) {
    if (!data.months) data.months = {};
    data.months[monthKey] = allocations;
  } else {
    data.default = allocations;
  }
  fs.writeFileSync(LABOUR_PATH, JSON.stringify(data, null, 2));
}

/**
 * Compute the labour cost group for one business tab.
 * Applies deduction first, then distributes the net total by tab/role %.
 * Returns an object in the same shape as other cost groups:
 *   { label, icon, total, categories: { RoleName: { total, lines[] } } }
 */
function computeLabour(labourTotal, allocations, tab) {
  const deduction  = allocations.deduction || 0;
  const netTotal   = Math.max(0, labourTotal - deduction);
  const tabPct     = (allocations.tabs[tab] || 0) / 100;
  const tabTotal   = netTotal * tabPct;
  const roleMap    = allocations.roles[tab] || {};
  const categories = {};

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

module.exports = { loadAllocations, saveAllocations, computeLabour, DEFAULT_TABS, DEFAULT_ROLES };
