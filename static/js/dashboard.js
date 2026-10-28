/**
 * static/js/dashboard.js
 * ──────────────────────
 * Drives the SpendSense Dashboard:
 *  - Checks if a budget exists for the active month.
 *  - If no budget is set, displays the Step 1 Gateway to set allowance and limit.
 *  - Once established, seamlessly unlocks the analytics cockpit with Chart.js charts.
 *  - Real-time reactivity on expenseSaved, expenseDeleted events.
 */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let donutChart = null;
let barChart   = null;
const monthPicker = document.getElementById('month-picker');
let currentMonth = (typeof getActiveMonth === 'function') ? getActiveMonth() : (monthPicker ? monthPicker.value : new Date().toISOString().slice(0, 7));
if (monthPicker) monthPicker.value = currentMonth;

// ── DOM refs: Gateway ─────────────────────────────────────────────────────────
const budgetSetupGate     = document.getElementById('budget-setup-gate');
const dashboardMainContent= document.getElementById('dashboard-main-content');
const gateMonthLabel      = document.getElementById('gate-month-label');
const gateForm            = document.getElementById('gate-form');
const gateAllowanceInput  = document.getElementById('gate-allowance');
const gateLimitInput      = document.getElementById('gate-limit');
const gateSavingsPreview  = document.getElementById('gate-savings-preview');
const gateError           = document.getElementById('gate-error');
const gateSubmitBtn       = document.getElementById('gate-submit-btn');
const gateSpinner         = document.getElementById('gate-spinner');
const headerBudgetBtn     = document.getElementById('header-budget-btn');

// ── DOM refs: Main Dashboard ──────────────────────────────────────────────────
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
const donutWrapper      = document.getElementById('donut-wrapper');
const barWrapper        = document.getElementById('bar-wrapper');
const donutEmpty        = document.getElementById('donut-empty');
const barEmpty          = document.getElementById('bar-empty');
const recentList        = document.getElementById('recent-list');
const recentEmpty       = document.getElementById('recent-empty');
const viewAllTxLink     = document.getElementById('view-all-tx-link');

// ── Colour palette for charts ─────────────────────────────────────────────────
const CHART_COLORS = [
  '#4F46E5', '#10B981', '#F59E0B', '#EF4444',
  '#06B6D4', '#8B5CF6', '#EC4899', '#84CC16',
];

// ── Gateway Helper Functions ──────────────────────────────────────────────────

function formatMonthName(ym) {
  const [y, m] = ym.split('-');
  const dt = new Date(Number(y), Number(m) - 1, 1);
  return dt.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function updateGateSavings() {
  const allowance = parseFloat(gateAllowanceInput.value) || 0;
  const limit     = parseFloat(gateLimitInput.value) || 0;
  const savings   = Math.max(0, allowance - limit);
  gateSavingsPreview.textContent = formatRupees(savings);
}

window.setGateAllowance = function(amt) {
  gateAllowanceInput.value = amt;
  // Automatically suggest 80% limit if not already filled
  if (!gateLimitInput.value) {
    gateLimitInput.value = Math.round(amt * 0.8);
  }
  updateGateSavings();
};

window.setGate80Percent = function() {
  const allowance = parseFloat(gateAllowanceInput.value);
  if (allowance && allowance > 0) {
    gateLimitInput.value = Math.round(allowance * 0.8);
    updateGateSavings();
  } else {
    gateError.textContent = 'Please enter your monthly allowance first.';
    gateError.classList.remove('d-none');
  }
};

if (gateAllowanceInput && gateLimitInput) {
  gateAllowanceInput.addEventListener('input', updateGateSavings);
  gateLimitInput.addEventListener('input', updateGateSavings);
}

// ── Gateway Form Submit ───────────────────────────────────────────────────────

if (gateForm) {
  gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    gateError.classList.add('d-none');

    const allowance = parseFloat(gateAllowanceInput.value);
    const limit     = parseFloat(gateLimitInput.value);

    if (isNaN(allowance) || allowance <= 0) {
      gateError.textContent = 'Please enter a valid monthly allowance (greater than ₹0).';
      gateError.classList.remove('d-none');
      return;
    }
    if (isNaN(limit) || limit < 0) {
      gateError.textContent = 'Please enter a valid spending limit.';
      gateError.classList.remove('d-none');
      return;
    }

    gateSubmitBtn.disabled = true;
    gateSpinner.classList.remove('d-none');

    try {
      const res = await fetch('/api/budgets', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          month:          currentMonth,
          allowance:      allowance,
          spending_limit: limit,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        // Trigger celebratory confetti effect
        if (typeof confetti === 'function') {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
          });
        }

        // Smooth transition into dashboard
        budgetSetupGate.classList.add('fade-out');
        setTimeout(() => {
          budgetSetupGate.classList.add('d-none');
          budgetSetupGate.classList.remove('fade-out');
          dashboardMainContent.classList.remove('d-none');
          dashboardMainContent.classList.add('animate-fade-in-up');
          loadDashboard(currentMonth);
        }, 300);
      } else {
        gateError.textContent = data.error || 'Failed to initialize budget.';
        gateError.classList.remove('d-none');
      }
    } catch {
      gateError.textContent = 'Network error. Please try again.';
      gateError.classList.remove('d-none');
    } finally {
      gateSubmitBtn.disabled = false;
      gateSpinner.classList.add('d-none');
    }
  });
}

// ── Main fetch & render ───────────────────────────────────────────────────────

async function loadDashboard(month) {
  try {
    if (viewAllTxLink) {
      viewAllTxLink.href = `/transactions?month=${month}`;
    }
    if (headerBudgetBtn) {
      headerBudgetBtn.href = `/budget?month=${month}`;
    }

    const res  = await fetch(`/api/analytics/${month}`);
    const data = await res.json();

    if (!res.ok) {
      console.error('Analytics error:', data.error);
      return;
    }

    // Check if user has set a budget for this month
    const hasConfiguredBudget = data.has_budget && (data.allowance > 0 || data.spending_limit > 0);

    if (!hasConfiguredBudget) {
      // Show Gateway, hide dashboard
      if (gateMonthLabel) {
        gateMonthLabel.textContent = formatMonthName(month);
      }
      budgetSetupGate.classList.remove('d-none');
      dashboardMainContent.classList.add('d-none');
      return;
    }

    // Otherwise unlock dashboard
    budgetSetupGate.classList.add('d-none');
    dashboardMainContent.classList.remove('d-none');

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

  // Visual cues for balance status
  statRemaining.style.color =
    data.remaining_balance < 0 ? 'var(--color-red)' : 'var(--color-green)';

  // Progress bar colour and width
  const pct = Math.min(data.utilisation_pct, 100);
  budgetProgressBar.style.width = pct + '%';
  budgetProgressBar.className   = 'progress-bar progress-bar-striped progress-bar-animated ' +
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
      `<div class="d-flex align-items-center">
         <i class="bi bi-exclamation-octagon-fill fs-4 me-3 text-danger"></i>
         <div>
           <div class="fw-bold">Budget Limit Reached or Exceeded!</div>
           <div class="small">You have spent <strong>${formatRupees(data.total_expenses)}</strong> out of your
           ${formatRupees(data.spending_limit)} limit (${data.utilisation_pct.toFixed(1)}%).</div>
         </div>
       </div>`;
  } else {
    budgetAlert.classList.add('alert-budget-warning');
    budgetAlert.innerHTML =
      `<div class="d-flex align-items-center">
         <i class="bi bi-exclamation-triangle-fill fs-4 me-3 text-warning"></i>
         <div>
           <div class="fw-bold">Approaching Monthly Spending Limit</div>
           <div class="small">You have consumed <strong>${data.utilisation_pct.toFixed(1)}%</strong> of your spending limit.
           Remaining budget: <strong>${formatRupees(data.remaining_budget)}</strong>.</div>
         </div>
       </div>`;
  }
}

// ── Donut chart ───────────────────────────────────────────────────────────────

function renderDonutChart(breakdown) {
  const empty = !breakdown || breakdown.length === 0;
  donutEmpty.classList.toggle('d-none', !empty);
  if (donutWrapper) donutWrapper.classList.toggle('d-none', empty);

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
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 3,
        borderColor: '#ffffff',
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      animation: {
        animateScale: true,
        animateRotate: true,
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: "'Plus Jakarta Sans', 'Inter', sans-serif", size: 12, weight: 500 },
            padding: 14,
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: {
          padding: 12,
          cornerRadius: 8,
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
  if (barWrapper) barWrapper.classList.toggle('d-none', empty);

  if (empty) {
    if (barChart) { barChart.destroy(); barChart = null; }
    return;
  }

  const labels = daily.map(d => {
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
        label:           'Daily Expense (₹)',
        data:            values,
        backgroundColor: '#4F46E5',
        hoverBackgroundColor: '#4338CA',
        borderRadius:    8,
        borderSkipped:   false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
        easing: 'easeOutQuart',
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          padding: 12,
          cornerRadius: 8,
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
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
          },
          grid: { color: '#F1F5F9' },
          border: { dash: [4, 4] },
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 } },
        },
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
  if (typeof setActiveMonth === 'function') {
    setActiveMonth(currentMonth);
  }
  loadDashboard(currentMonth);
});

document.addEventListener('expenseSaved',   () => loadDashboard(currentMonth));
document.addEventListener('expenseDeleted', () => loadDashboard(currentMonth));

// ── Initial load ──────────────────────────────────────────────────────────────
loadDashboard(currentMonth);
