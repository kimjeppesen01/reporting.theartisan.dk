/* ── Expand/collapse cost groups ── */
function toggleGroup(groupKey) {
  var body = document.getElementById('body-' + groupKey);
  var chevron = document.getElementById('chevron-' + groupKey);
  if (!body) return;
  var isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.classList.toggle('open', !isOpen);
}

function toggleCategory(id) {
  var lines = document.getElementById('lines-' + id);
  if (!lines) return;
  lines.style.display = lines.style.display === 'none' ? 'block' : 'none';
}

/* ── Manual categorization ── */
function assignCategory(billLineId, selectEl) {
  var category = selectEl.value;
  if (!category) return;

  var item = document.getElementById('item-' + billLineId);
  if (item) item.classList.add('saving');

  fetch('/api/categorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billLineId: billLineId, category: category })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.ok && item) {
      item.classList.remove('saving');
      item.classList.add('saved');
      item.innerHTML = '<div style="font-size:0.75rem;color:#16a34a;padding:0.25rem 0;">✓ Assigned to <strong>' + category + '</strong> — reload to see updated totals</div>';
    } else {
      if (item) item.classList.remove('saving');
      selectEl.value = '';
      alert('Error: ' + (data.error || 'Unknown error'));
    }
  })
  .catch(function() {
    if (item) item.classList.remove('saving');
    selectEl.value = '';
    alert('Network error — please try again');
  });
}

/* ── Shared DKK formatter ── */
function dkkTick(v) {
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000)    return (v / 1000).toFixed(0) + 'k';
  return String(v);
}

/* ── Operating Expenses Donut Chart ── */
document.addEventListener('DOMContentLoaded', function() {
  var canvas  = document.getElementById('opexDonut');
  var dataEl  = document.getElementById('opex-donut-data');
  if (!canvas || !dataEl) return;

  var d;
  try { d = JSON.parse(dataEl.textContent); } catch(e) { return; }

  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: d.labels,
      datasets: [{
        data: d.values,
        backgroundColor: d.colors,
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              var pct = d.total > 0 ? (ctx.raw / d.total * 100).toFixed(1) : 0;
              return ' ' + ctx.label + ': DKK ' + ctx.raw.toLocaleString('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' (' + pct + '%)';
            }
          }
        }
      }
    }
  });
});

/* ── Cashflow Area + Bar Charts ── */
document.addEventListener('DOMContentLoaded', function() {
  var timelineEl = document.getElementById('cashflow-timeline');
  if (!timelineEl) return;

  var cf;
  try { cf = JSON.parse(timelineEl.textContent); } catch(e) { return; }

  var POSITIVE = '#16a34a';
  var NEGATIVE = '#dc2626';

  /* Inflow vs Outflow area chart */
  var areaCanvas = document.getElementById('cfAreaChart');
  if (areaCanvas) {
    new Chart(areaCanvas, {
      type: 'line',
      data: {
        labels: cf.labels,
        datasets: [
          {
            label: 'Inflow',
            data: cf.inflow,
            borderColor: POSITIVE,
            borderWidth: 2,
            backgroundColor: 'rgba(22,163,74,0.12)',
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointBackgroundColor: POSITIVE,
          },
          {
            label: 'Outflow',
            data: cf.outflow,
            borderColor: NEGATIVE,
            borderWidth: 2,
            backgroundColor: 'rgba(220,38,38,0.08)',
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointBackgroundColor: NEGATIVE,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(ctx) {
                return ' ' + ctx.dataset.label + ': DKK ' + (ctx.raw || 0).toLocaleString('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#f1f5f9' },
            ticks: { font: { size: 11 }, color: '#94a3b8' }
          },
          y: {
            beginAtZero: true,
            grid: { color: '#f1f5f9', drawBorder: false },
            ticks: {
              callback: function(v) { return dkkTick(v); },
              font: { size: 11 }, color: '#94a3b8'
            }
          }
        }
      }
    });
  }

  /* Net Cashflow bar chart */
  var netCanvas = document.getElementById('cfNetChart');
  if (netCanvas) {
    var netColors = cf.net.map(function(v) {
      return v >= 0 ? 'rgba(30,58,95,0.85)' : 'rgba(220,38,38,0.75)';
    });
    new Chart(netCanvas, {
      type: 'bar',
      data: {
        labels: cf.labels,
        datasets: [{
          label: 'Net',
          data: cf.net,
          backgroundColor: netColors,
          borderRadius: 4,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                return ' Net: DKK ' + (ctx.raw || 0).toLocaleString('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: '#94a3b8' }
          },
          y: {
            grid: { color: '#f1f5f9', drawBorder: false },
            ticks: {
              callback: function(v) { return dkkTick(v); },
              font: { size: 11 }, color: '#94a3b8'
            }
          }
        }
      }
    });
  }
});

/* ── Waterfall Chart ── */
document.addEventListener('DOMContentLoaded', function() {
  var canvas = document.getElementById('waterfallChart');
  var dataEl = document.getElementById('waterfall-data');
  if (!canvas || !dataEl) return;

  var data;
  try { data = JSON.parse(dataEl.textContent); } catch(e) { return; }

  var labels = data.labels;
  var values = data.values;

  // Build waterfall: running base + bar height
  var bases = [];
  var bars = [];
  var colors = [];
  var running = 0;

  values.forEach(function(v, i) {
    if (i === 0) {
      // Revenue bar starts at 0
      bases.push(0);
      bars.push(v);
      colors.push('#16a34a');
      running = v;
    } else if (i === values.length - 1) {
      // Profit bar — positive=green, negative=red
      bases.push(0);
      bars.push(v);
      colors.push(v >= 0 ? '#1e3a5f' : '#dc2626');
    } else {
      // Cost deductions (negative values)
      var absVal = Math.abs(v);
      running += v; // v is negative
      bases.push(Math.max(running, 0));
      bars.push(absVal);
      colors.push('#d97706');
    }
  });

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          // Invisible base (for stacking illusion)
          data: bases,
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderWidth: 0,
          stack: 'waterfall',
        },
        {
          // Visible bars
          data: bars,
          backgroundColor: colors,
          borderRadius: 4,
          stack: 'waterfall',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              if (ctx.datasetIndex === 0) return null; // hide base
              var rawVal = values[ctx.dataIndex];
              return 'DKK ' + Math.abs(rawVal).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { size: 11 }, maxRotation: 30 }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          ticks: {
            callback: function(v) {
              return v >= 1000 ? 'DKK ' + (v/1000).toFixed(0) + 'k' : 'DKK ' + v;
            },
            font: { size: 10 }
          }
        }
      }
    }
  });
});
