// Account code + supplier → category mapping
// Edit this file to update categorization rules

module.exports = {

  // Revenue account codes
  revenue: {
    cafe:    '1111',
    events:  '1117',
    webshop: '1112',
    b2b_dk:  '1114',
    b2b_eu:  '1144',
  },

  // Cost categories — order matters for display
  costs: {

    // Café food/drink supplies — account 1211, grouped by contact name
    // Names must match Billy contact names (case-insensitive, partial/contains also supported)
    cafe: {
      account: '1211',
      label: 'Café Costs',
      icon: '☕',
      categories: {
        'Bread': [
          'Københavns Bageri ApS',
          'Copenhagen Bakery',        // Billy bank-import name
          'Bagel Belly',
          'Gluten Tag',
        ],
        'Ingredients': [
          'Salling group A/S',
          'HØRKRAM FOODSERVICE A/S',
          'HØRKRAM FOODSERVICE',      // partial: matches "LS  HØRKRAM FOODSERVICE A"
          'FÆRM ApS',
          'TH-Juice ApS',
          'Food',                     // generic description fallback
        ],
        'Tea': [
          'Sing Tehus',
          'Mushroom Alchemy',
          'mushroomalchemy',          // partial: matches "www.mushroomalchemy.eu"
        ],
        'Soft Drinks': [
          'Beverage Collection ApS',
          'Beverage (juice)',         // Billy bank-import description
        ],
      },
    },

    // Coffee — split by account code
    coffee: {
      label: 'Coffee',
      icon: '☕',
      byAccount: {
        '1234': 'Coffee EU',
        '1244': 'Coffee Import',
        '1271': 'Coffee Packaging',
      },
    },

    // Admin subscriptions — account 1815, grouped by contact name
    // Account 1230 (Oualid Naid) rolls into Marketing
    admin: {
      account: '1815',
      label: 'Admin & Marketing',
      icon: '💼',
      categories: {
        'Admin': [
          'Microsoft',               // exact: also matches "MICROSOFTÆG..." via contains
        ],
        'Marketing': [
          'Canva Pty Ltd',
          'Claude',
          'CLAUDE.AI',               // partial: matches "CLAUDE.AI SUBSCRIPTION"
        ],
      },
      // Extra accounts that roll into a sub-category
      extraAccounts: {
        '1230': 'Marketing', // All lines on account 1230 → Marketing
      },
    },

    // Accounting — full account, no supplier split
    accounting: {
      account: '1825',
      label: 'Accounting',
      icon: '📊',
    },

    // Fixed overheads — by account code
    fixed: {
      label: 'Fixed Costs',
      icon: '🏠',
      byAccount: {
        '1510': 'Rent',
        '1530': 'Electricity',
        '1535': 'Trash Service',
        '1540': 'Cleaning',
        '1560': 'Renovations',
        '1830': 'Internet',
        '1870': 'Insurance',
      },
      // Special sub-label: lines from this contact on account 1540 → Window Cleaning
      subLabels: {
        '1540': {
          'HALSNÆS EJENDOMSSERVICE ApS': 'Window Cleaning',
        },
      },
    },

    // Webshop-specific costs
    webshop: {
      label: 'Webshop',
      icon: '🛒',
      byAccount: {
        '1610': 'Webshop Shipping',
        '1810': 'Webshop Hosting',
      },
    },

    // Miscellaneous
    other: {
      label: 'Other',
      icon: '📦',
      byAccount: {
        '1841': 'Small Equipment',
      },
    },

  },

  // Account codes to fully ignore (excluded from costs AND uncategorized)
  // 14xx accounts are excluded via labour.accountPrefix prefix matching below
  ignore: ['1218'],

  // Labour — all 14xx accounts summed, distributed manually via /labour editor
  labour: {
    accountPrefix: '14',   // All accounts starting with '14' are payroll/labour
    label: 'Labour',
    icon: '👥',
    roles: {
      cafe:    ['Operations', 'Management', 'Production', 'Marketing', 'Cleaning'],
      events:  ['Operations', 'Planning', 'Production'],
      b2b:     ['Sales', 'Roasting', 'Testing', 'Packaging'],
      webshop: ['Development', 'Packaging/Shipping'],
    },
  },

  // All available category labels (for the uncategorized dropdown)
  get allCategories() {
    const cats = [];
    const c = this.costs;
    // Café sub-categories
    Object.keys(c.cafe.categories).forEach(k => cats.push(k));
    // Coffee sub-categories
    Object.values(c.coffee.byAccount).forEach(v => cats.push(v));
    // Admin sub-categories
    Object.keys(c.admin.categories).forEach(k => cats.push(k));
    cats.push(c.accounting.label);
    // Fixed sub-categories
    Object.values(c.fixed.byAccount).forEach(v => cats.push(v));
    // Webshop sub-categories
    Object.values(c.webshop.byAccount).forEach(v => cats.push(v));
    // Other sub-categories
    Object.values(c.other.byAccount).forEach(v => cats.push(v));
    return [...new Set(cats)];
  },
};
