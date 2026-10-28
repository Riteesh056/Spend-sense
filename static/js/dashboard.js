/**
 * static/js/dashboard.js
 * ──────────────────────
 * Drives the dashboard page:
 *  - Reads the month from the picker and fetches /api/analytics/<month>
 *  - Populates summary cards, budget alert, charts, and recent transactions
 *  - Re-fetches whenever an expense is added, edited, or deleted
 */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let donutChart = null;
let barChart   = null;
let currentMonth = document.getElementById('month-picker').value;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const monthPicker       = document.getElementById('month-picker');
const budgetAlert       = document.getElementById('budget-alert');
const statAllowance     = document.getElementById('stat-allowance');
const statTotalSpent    = document.getElementById('stat-total-spent');
const statRemaining     = document.getElementById('stat-remaining');
const statUtilisation   = document.getElementById('stat-utilisation');
const statLimit         = document.getElementById('stat-limit');
const budgetProgressBar = document.getElementById('budget-progress-bar');
const donutCtx          = document.getElementById('donut-chart');
const barCtx            = document.getElementById('bar-chart');
const donutEmpty        = document.getElementById('donut-empty');
const barEmpty          = document.getElementById('bar-empty');
const recentList        = document.getElementById('recent-list');
const recentEmpty       = document.getElementById('recent-empty');

// ── Colour palette for charts ─────────────────────────────────────────────────
const CHART_COLORS = [
  '#4F46E5', '#16A34A', '#D97706', '#DC2626',
  '#0891B2', '#7C3AED', '#DB2777', '#65A30D',
];

// ── Main fetch & render ───────────────────────────────────────────────────────

async function loadDashboard(month) {
  try {
    const res  = await fetch(`/api/analytics/${month}`);
    const data = await res.json();

    if (!res.ok) {
      console.error('Analytics error:', data.error);
      return;
    }

    renderSummaryCards(data);
    renderBudgetAlert(data);
    renderDonutChart(data.category_breakdown);
    renderBarChart(data.daily_spending);
    renderRecentTransactions(data.recent_expenses);

  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function renderSummaryCards(data) {
  statAllowance.textContent   = formatRupees(data.allowance);
  statTotalSpent.textContent  = formatRupees(data.total_expenses);
  statRemaining.textContent   = formatRupees(data.remaining_balance);
  statUtilisation.textContent = data.utilisation_pct.toFixed(1) + '%';
  if (statLimit) {
    statLimit.textContent = 'Limit: ' + formatRupees(data.spending_limit);
  }

  // Colour the remaining balance red if negative
  statRemaining.style.color =
    data.remaining_balance < 0 ? 'var(--color-red)' : 'var(--color-text)';

  // Progress bar colour and width
  const pct = Math.min(data.utilisation_pct, 100);
  budgetProgressBar.style.width = pct + '%';
  budgetProgressBar.className   = 'progress-bar ' +
    (data.alert_level === 'danger'  ? 'bg-danger'  :
     data.alert_level === 'warning' ? 'bg-warning' : 'bg-success');
}

// ── Budget alert banner ───────────────────────────────────────────────────────

function renderBudgetAlert(data) {
  if (data.alert_level === 'normal' || data.spending_limit === 0) {
    budgetAlert.classList.add('d-none');
    return;
  }

  budgetAlert.classList.remove('d-none', 'alert-budget-warning', 'alert-budget-danger');

  if (data.alert_level === 'danger') {
    budgetAlert.classList.add('alert-budget-danger');
    budgetAlert.innerHTML =
      `<i class="bi bi-exclamation-octagon-fill me-2"></i>
       <strong>Budget Exceeded!</strong>
       You have spent ${formatRupees(data.total_expenses)} out of your
       ${formatRupees(data.spending_limit)} limit
       (${data.utilisation_pct.toFixed(1)}%).`;
  } else {
    budgetAlert.classList.add('alert-budget-warning');
    budgetAlert.innerHTML =
      `<i class="bi bi-exclamation-triangle-fill me-2"></i>
       <strong>Budget Warning:</strong>
       You have used ${data.utilisation_pct.toFixed(1)}% of your monthly budget.
       Only ${formatRupees(data.remaining_budget)} remaining.`;
  }
}

// ── Donut chart ───────────────────────────────────────────────────────────────

function renderDonutChart(breakdown) {
  const empty = !breakdown || breakdown.length === 0;
  donutEmpty.classList.toggle('d-none', !empty);
  donutCtx.classList.toggle('d-none',   empty);

  if (empty) {
    if (donutChart) { donutChart.destroy(); donutChart = null; }
    return;
  }

  const labels = breakdown.map(b => b.category);
  const values = breakdown.map(b => b.total);
  const colors = labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

  if (donutChart) donutChart.destroy();

  donutChart = new Chart(donutCtx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 12 }, padding: 12 },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatRupees(ctx.parsed)}`,
          },
        },
      },
    },
  });
}

// ── Bar chart ─────────────────────────────────────────────────────────────────

function renderBarChart(daily) {
  const empty = !daily || daily.length === 0;
  barEmpty.classList.toggle('d-none', !empty);
  barCtx.classList.toggle('d-none',   empty);

  if (empty) {
    if (barChart) { barChart.destroy(); barChart = null; }
    return;
  }

  const labels = daily.map(d => {
    // Show as "Oct 5" style
    const dt = new Date(d.date + 'T00:00:00');
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  });
  const values = daily.map(d => d.total);

  if (barChart) barChart.destroy();

  barChart = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label:           'Spent (₹)',
        data:            values,
        backgroundColor: '#4F46E5',
        borderRadius:    6,
        borderSkipped:   false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${formatRupees(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: v => '₹' + v.toLocaleString('en-IN'),
          },
          grid: { color: '#F3F4F6' },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

// ── Recent transactions ───────────────────────────────────────────────────────

function renderRecentTransactions(expenses) {
  const empty = !expenses || expenses.length === 0;
  recentEmpty.classList.toggle('d-none', !empty);

  if (empty) { recentList.innerHTML = ''; return; }

  recentList.innerHTML = expenses.map(exp => `
    <div class="tx-item">
      <div class="tx-icon">${categoryIcon(exp.category)}</div>
      <div class="tx-details">
        <div class="tx-cat">${escapeHtml(exp.category)}</div>
        <div class="tx-note">${exp.note ? escapeHtml(exp.note) : '—'}</div>
      </div>
      <div class="text-end">
        <div class="tx-amount">${formatRupees(exp.amount)}</div>
        <div class="tx-date">${formatDate(exp.expense_date)}</div>
      </div>
    </div>
  `).join('');
}

// ── Utility ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  const dt = new Date(iso + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Event listeners ───────────────────────────────────────────────────────────

monthPicker.addEventListener('change', () => {
  currentMonth = monthPicker.value;
  loadDashboard(currentMonth);
});

document.addEventListener('expenseSaved',   () => loadDashboard(currentMonth));
document.addEventListener('expenseDeleted', () => loadDashboard(currentMonth));

// ── Initial load ──────────────────────────────────────────────────────────────
loadDashboard(currentMonth);
