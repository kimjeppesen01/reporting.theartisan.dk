const axios = require('axios');

const billy = axios.create({
  baseURL: 'https://api.billysbilling.com/v2',
  headers: {
    'X-Access-Token': process.env.BILLY_API_TOKEN || ''
  }
});

async function getOrganisation() {
  const res = await billy.get('/organization');
  return res.data.organization;
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
  getInvoices,
  getBills,
  getBankPayments
};
