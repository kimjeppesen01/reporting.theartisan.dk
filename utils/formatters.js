function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return 'DKK 0.00';
  return 'DKK ' + Number(amount).toLocaleString('da-DK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatPercent(value) {
  if (value == null || isNaN(value)) return '0.0%';
  return Number(value).toFixed(1) + '%';
}

module.exports = { formatCurrency, formatPercent };
