const path = require('path');
const fs = require('fs');
const mapping = require('../config/mapping');

const OVERRIDES_PATH = path.join(__dirname, '../data/overrides.json');

function loadOverrides() {
  try {
    return JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveOverride(billLineId, category) {
  const overrides = loadOverrides();
  overrides[billLineId] = category;
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(overrides, null, 2));
}

// Normalize supplier name for case-insensitive matching
function normName(name) {
  return (name || '').trim().toLowerCase();
}

// Build a reverse lookup: normalized supplier name → { groupKey, categoryName }
function buildSupplierLookup() {
  const lookup = {};
  const c = mapping.costs;

  // Café: account + supplier
  Object.entries(c.cafe.categories).forEach(([cat, suppliers]) => {
    suppliers.forEach(s => {
      lookup[normName(s)] = { groupKey: 'cafe', category: cat };
    });
  });

  // Admin: account + supplier
  Object.entries(c.admin.categories).forEach(([cat, suppliers]) => {
    suppliers.forEach(s => {
      lookup[normName(s)] = { groupKey: 'admin', category: cat };
    });
  });

  return lookup;
}

const supplierLookup = buildSupplierLookup();

// Build account-code → { groupKey, category } lookup (for byAccount groups)
function buildAccountLookup(accountMap) {
  const lookup = {};
  const c = mapping.costs;

  // Coffee
  Object.entries(c.coffee.byAccount).forEach(([code, cat]) => {
    const acc = accountMap[code];
    if (acc) lookup[acc.id] = { groupKey: 'coffee', category: cat };
  });

  // Admin extra accounts (1230 → Marketing)
  Object.entries(c.admin.extraAccounts || {}).forEach(([code, cat]) => {
    const acc = accountMap[code];
    if (acc) lookup[acc.id] = { groupKey: 'admin', category: cat };
  });

  // Accounting
  const acctAcc = accountMap[c.accounting.account];
  if (acctAcc) lookup[acctAcc.id] = { groupKey: 'accounting', category: c.accounting.label };

  // Fixed
  Object.entries(c.fixed.byAccount).forEach(([code, cat]) => {
    const acc = accountMap[code];
    if (acc) lookup[acc.id] = { groupKey: 'fixed', category: cat };
  });

  // Webshop
  Object.entries(c.webshop.byAccount).forEach(([code, cat]) => {
    const acc = accountMap[code];
    if (acc) lookup[acc.id] = { groupKey: 'webshop', category: cat };
  });

  // Other
  Object.entries(c.other.byAccount).forEach(([code, cat]) => {
    const acc = accountMap[code];
    if (acc) lookup[acc.id] = { groupKey: 'other', category: cat };
  });

  return lookup;
}

// Build the set of ignored account IDs
function buildIgnoreSet(accountMap) {
  const s = new Set();
  mapping.ignore.forEach(code => {
    const acc = accountMap[code];
    if (acc) s.add(acc.id);
  });
  return s;
}

// Build café account ID set
function getCafeAccountId(accountMap) {
  const acc = accountMap[mapping.costs.cafe.account];
  return acc ? acc.id : null;
}

// Build admin account ID
function getAdminAccountId(accountMap) {
  const acc = accountMap[mapping.costs.admin.account];
  return acc ? acc.id : null;
}

/**
 * Categorize bill lines into grouped costs + uncategorized list.
 *
 * Returns:
 * {
 *   groups: {
 *     cafe:       { label, icon, total, categories: { Name: { total, lines[] } } },
 *     coffee:     { label, icon, total, categories: { ... } },
 *     admin:      { label, icon, total, categories: { ... } },
 *     accounting: { label, icon, total, categories: { Accounting: { total, lines[] } } },
 *     fixed:      { label, icon, total, categories: { ... } },
 *     webshop:    { label, icon, total, categories: { ... } },
 *     other:      { label, icon, total, categories: { ... } },
 *   },
 *   uncategorized: [ { id, supplierName, amount, description, date } ]
 * }
 */
function categorizeBillLines(billLines, accountMap, contactMap) {
  const overrides = loadOverrides();
  const accountLookup = buildAccountLookup(accountMap);
  const ignoreSet = buildIgnoreSet(accountMap);
  const cafeAccountId = getCafeAccountId(accountMap);
  const adminAccountId = getAdminAccountId(accountMap);

  // Initialise groups
  const groups = {};
  ['cafe', 'coffee', 'admin', 'accounting', 'fixed', 'webshop', 'other'].forEach(key => {
    const def = mapping.costs[key];
    groups[key] = {
      label: def.label,
      icon: def.icon || '📁',
      total: 0,
      categories: {},
    };
  });

  const uncategorized = [];

  billLines.forEach(line => {
    const amount = line.amount || 0;
    if (amount === 0) return;

    const accountId = line.accountId || (line.account && line.account.id);
    const contactId = line.contactId || (line.contact && line.contact.id);
    const supplierName = contactMap[contactId] || line.description || 'Unknown';
    const lineDate = line.entryDate || line.date || '';

    // Skip ignored accounts
    if (ignoreSet.has(accountId)) return;

    // Check manual override first
    if (overrides[line.id]) {
      const cat = overrides[line.id];
      const groupKey = findGroupForCategory(cat);
      addToGroup(groups, groupKey, cat, amount, line.id, supplierName, lineDate);
      return;
    }

    // Try café account + supplier name lookup
    if (accountId === cafeAccountId) {
      const match = supplierLookup[normName(supplierName)];
      if (match && match.groupKey === 'cafe') {
        addToGroup(groups, 'cafe', match.category, amount, line.id, supplierName, lineDate);
        return;
      }
      // Café account but supplier not recognized → uncategorized
      uncategorized.push({ id: line.id, supplierName, amount, description: line.description, date: lineDate });
      return;
    }

    // Try admin account + supplier name lookup
    if (accountId === adminAccountId) {
      const match = supplierLookup[normName(supplierName)];
      if (match && match.groupKey === 'admin') {
        addToGroup(groups, 'admin', match.category, amount, line.id, supplierName, lineDate);
        return;
      }
      // Admin account but supplier not recognized → uncategorized
      uncategorized.push({ id: line.id, supplierName, amount, description: line.description, date: lineDate });
      return;
    }

    // Try account-code-based lookup (coffee, fixed, webshop, accounting, other, admin extras)
    if (accountLookup[accountId]) {
      const { groupKey, category } = accountLookup[accountId];

      // Fixed: check for sub-label override by supplier
      if (groupKey === 'fixed') {
        const subLabels = mapping.costs.fixed.subLabels || {};
        const accountCode = Object.keys(accountMap).find(k => accountMap[k].id === accountId);
        const subLabel = subLabels[accountCode] && subLabels[accountCode][supplierName];
        addToGroup(groups, 'fixed', subLabel || category, amount, line.id, supplierName, lineDate);
      } else {
        addToGroup(groups, groupKey, category, amount, line.id, supplierName, lineDate);
      }
      return;
    }

    // Nothing matched → uncategorized
    uncategorized.push({ id: line.id, supplierName, amount, description: line.description, date: lineDate });
  });

  return { groups, uncategorized };
}

function addToGroup(groups, groupKey, category, amount, lineId, supplierName, date) {
  if (!groups[groupKey]) return;
  groups[groupKey].total += amount;
  if (!groups[groupKey].categories[category]) {
    groups[groupKey].categories[category] = { total: 0, lines: [] };
  }
  groups[groupKey].categories[category].total += amount;
  groups[groupKey].categories[category].lines.push({ id: lineId, supplierName, amount, date });
}

function findGroupForCategory(categoryName) {
  const c = mapping.costs;
  if (Object.keys(c.cafe.categories).includes(categoryName)) return 'cafe';
  if (Object.values(c.coffee.byAccount).includes(categoryName)) return 'coffee';
  if (Object.keys(c.admin.categories).includes(categoryName)) return 'admin';
  if (categoryName === c.accounting.label) return 'accounting';
  if (Object.values(c.fixed.byAccount).includes(categoryName)) return 'fixed';
  if (Object.values(c.webshop.byAccount).includes(categoryName)) return 'webshop';
  if (Object.values(c.other.byAccount).includes(categoryName)) return 'other';
  return 'other'; // fallback
}

/**
 * Aggregate invoice lines by revenue account code.
 * Returns { cafe, events, webshop, b2b_dk, b2b_eu, total }
 */
function aggregateRevenue(invoices, accountMap) {
  const rev = mapping.revenue;
  const result = { cafe: 0, events: 0, webshop: 0, b2b_dk: 0, b2b_eu: 0, total: 0 };

  // Build accountId → streamKey map
  const streamMap = {};
  Object.entries(rev).forEach(([key, code]) => {
    const acc = accountMap[code];
    if (acc) streamMap[acc.id] = key;
  });

  invoices.forEach(inv => {
    const amount = inv.amount || 0;
    // Try to match by contactAccountNo (account code on the invoice)
    const code = String(inv.contactAccountNo || inv.accountNo || '');
    const stream = Object.entries(rev).find(([, c]) => c === code);
    if (stream) {
      result[stream[0]] = (result[stream[0]] || 0) + amount;
      result.total += amount;
    } else {
      // Fallback: add to total only
      result.total += amount;
    }
  });

  return result;
}

module.exports = {
  categorizeBillLines,
  aggregateRevenue,
  loadOverrides,
  saveOverride,
};
