const axios = require('axios');

const billy = axios.create({
  baseURL: 'https://api.billysbilling.com/v2',
  headers: {
    'X-Access-Token': process.env.BILLY_API_TOKEN || ''
  }
});

// In-memory cache for stable reference data
let _accountsCache = null;

async function getOrganisation() {
  const res = await billy.get('/organization');
  return res.data.organization;
}

// Returns { accountNo: { id, name } }
async function getAccounts() {
  if (_accountsCache) return _accountsCache;
  const res = await billy.get('/accounts', { params: { pageSize: 1000 } });
  const map = {};
  (res.data.accounts || []).forEach(a => {
    map[String(a.accountNo)] = { id: a.id, name: a.name };
  });
  _accountsCache = map;
  return map;
}

function clearCache() {
  _accountsCache = null;
}

async function getInvoices(startDate, endDate) {
  const res = await billy.get('/invoices', {
    params: {
      state: 'approved',
      minEntryDate: startDate,
      maxEntryDate: endDate,
      pageSize: 1000
    }
  });
  return res.data.invoices || [];
}

async function getBills(startDate, endDate) {
  const res = await billy.get('/bills', {
    params: {
      state: 'approved',
      minEntryDate: startDate,
      maxEntryDate: endDate,
      pageSize: 1000
    }
  });
  return res.data.bills || [];
}

// Fetch lines for a single bill
async function _getBillLinesForId(billId) {
  const res = await billy.get('/billLines', { params: { billId, pageSize: 1000 } });
  return res.data.billLines || [];
}

/**
 * Fetch all bill lines for a date range.
 * Strategy: fetch bills first (has contactName), then batch-fetch their lines.
 * Returns enriched lines: { id, billId, accountId, contactName, amount, description, date }
 */
async function getBillsWithLines(startDate, endDate) {
  const bills = await getBills(startDate, endDate);
  if (bills.length === 0) return [];

  // Build billId → { contactName, date } map
  const billMeta = {};
  bills.forEach(b => {
    billMeta[b.id] = { contactName: b.contactName || '', date: b.entryDate || '' };
  });

  // Batch-fetch lines: 10 bills at a time in parallel
  const BATCH = 10;
  const allLines = [];
  for (let i = 0; i < bills.length; i += BATCH) {
    const batch = bills.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(b => _getBillLinesForId(b.id)));
    results.forEach(lines => {
      lines.forEach(line => {
        const meta = billMeta[line.billId] || {};
        allLines.push({
          id: line.id,
          billId: line.billId,
          accountId: line.accountId,
          contactName: meta.contactName,
          amount: line.amount || 0,
          description: line.description || '',
          date: meta.date,
        });
      });
    });
  }
  return allLines;
}

async function getBankPayments(startDate, endDate) {
  const res = await billy.get('/bankPayments', {
    params: {
      minEntryDate: startDate,
      maxEntryDate: endDate,
      pageSize: 1000
    }
  });
  return res.data.bankPayments || [];
}

// Fetch lines for a single daybook transaction
async function _getDaybookLinesForId(txnId) {
  const res = await billy.get('/daybookTransactionLines', {
    params: { daybookTransactionId: txnId, pageSize: 1000 }
  });
  return res.data.daybookTransactionLines || [];
}

/**
 * Fetch all daybook transaction lines for a date range.
 * Used for revenue aggregation (credit-side lines on revenue accounts).
 * Returns enriched lines: { id, txnId, accountId, side, amount, date }
 */
async function getDaybookLinesForRevenue(startDate, endDate) {
  const res = await billy.get('/daybookTransactions', {
    params: {
      minEntryDate: startDate,
      maxEntryDate: endDate,
      pageSize: 1000
    }
  });
  const txns = res.data.daybookTransactions || [];
  if (txns.length === 0) return [];

  const BATCH = 10;
  const allLines = [];
  for (let i = 0; i < txns.length; i += BATCH) {
    const batch = txns.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(t => _getDaybookLinesForId(t.id)));
    results.forEach((lines, idx) => {
      const date = batch[idx].entryDate || '';
      lines.forEach(line => {
        allLines.push({
          id: line.id,
          txnId: line.daybookTransactionId,
          accountId: line.accountId,
          side: line.side,
          amount: line.amount || 0,
          date,
        });
      });
    });
  }
  return allLines;
}

module.exports = {
  getOrganisation,
  getAccounts,
  clearCache,
  getInvoices,
  getBills,
  getBillsWithLines,
  getBankPayments,
  getDaybookLinesForRevenue,
};
