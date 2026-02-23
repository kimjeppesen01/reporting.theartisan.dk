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
