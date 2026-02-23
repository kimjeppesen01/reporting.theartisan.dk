const axios = require('axios');

const billy = axios.create({
  baseURL: 'https://api.billysbilling.com/v2',
  headers: {
    'X-Access-Token': process.env.BILLY_API_TOKEN || ''
  }
});

// Simple in-memory cache for accounts/contacts (stable data)
let _accountsCache = null;
let _contactsCache = null;

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

// Returns { contactId: contactName }
async function getContacts() {
  if (_contactsCache) return _contactsCache;
  const res = await billy.get('/contacts', { params: { pageSize: 1000 } });
  const map = {};
  (res.data.contacts || []).forEach(c => {
    map[c.id] = c.name;
  });
  _contactsCache = map;
  return map;
}

function clearCache() {
  _accountsCache = null;
  _contactsCache = null;
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

// Invoice lines — for revenue split by account code
async function getInvoiceLines(startDate, endDate) {
  const res = await billy.get('/invoiceLines', {
    params: {
      minEntryDate: startDate,
      maxEntryDate: endDate,
      pageSize: 1000
    }
  });
  return res.data.invoiceLines || [];
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

// Bill lines — for cost split by account + contact name
async function getBillLines(startDate, endDate) {
  const res = await billy.get('/billLines', {
    params: {
      minEntryDate: startDate,
      maxEntryDate: endDate,
      pageSize: 1000
    }
  });
  return res.data.billLines || [];
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

module.exports = {
  getOrganisation,
  getAccounts,
  getContacts,
  clearCache,
  getInvoices,
  getInvoiceLines,
  getBills,
  getBillLines,
  getBankPayments,
};
