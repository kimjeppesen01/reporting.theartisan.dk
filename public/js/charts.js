document.addEventListener('DOMContentLoaded', function () {
  var canvas = document.getElementById('cashflowChart');
  if (!canvas) return;

  var cashIn = parseFloat(canvas.dataset.cashIn) || 0;
  var cashOut = parseFloat(canvas.dataset.cashOut) || 0;

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Cash In', 'Cash Out'],
      datasets: [{
        data: [cashIn, cashOut],
        backgroundColor: ['#16a34a', '#dc2626'],
        borderRadius: 4,
        barThickness: 28
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return 'DKK ' + ctx.raw.toLocaleString('da-DK', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              });
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          ticks: {
            callback: function (v) {
              return 'DKK ' + v.toLocaleString('da-DK');
            },
            font: { size: 11 }
          }
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 12, weight: '600' } }
        }
      }
    }
  });
});
