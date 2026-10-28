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

// ── DOM refs: Edit Budget Modal ───────────────────────────────────────────────
const editBudgetModalEl   = document.getElementById('editBudgetModal');
const editBudgetModal     = editBudgetModalEl ? new bootstrap.Modal(editBudgetModalEl) : null;
const editBudgetForm      = document.getElementById('edit-budget-form');
const editAllowanceInput  = document.getElementById('edit-budget-allowance');
const editLimitInput      = document.getElementById('edit-budget-limit');
const editSavingsPreview  = document.getElementById('edit-budget-savings-preview');
const editBudgetMonthLabel= document.getElementById('edit-budget-month-label');
const editError           = document.getElementById('edit-budget-error');
const editSaveBtn         = document.getElementById('edit-budget-save-btn');
const editSpinner         = document.getElementById('edit-budget-spinner');

// ── DOM refs: Reset Month Modal ───────────────────────────────────────────────
const resetMonthModalEl    = document.getElementById('resetMonthModal');
const resetMonthModal      = resetMonthModalEl ? new bootstrap.Modal(resetMonthModalEl) : null;
const resetMonthForm       = document.getElementById('reset-month-form');
const resetModalMonthLabel = document.getElementById('reset-modal-month-label');
const resetWarningMonth    = document.getElementById('reset-warning-month');
const resetPreviewMonth    = document.getElementById('reset-preview-month');
const resetPreviewAllowance= document.getElementById('reset-preview-allowance');
const resetPreviewSpent    = document.getElementById('reset-preview-spent');
const resetModalError      = document.getElementById('reset-modal-error');
const resetConfirmBtn      = document.getElementById('reset-confirm-btn');
const resetSpinner         = document.getElementById('reset-spinner');

// ── In-memory state for active budget ─────────────────────────────────────────
let currentBudgetData = { allowance: 0, spending_limit: 0 };

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

// ── Edit Budget Modal Logic ───────────────────────────────────────────────────

function updateEditSavings() {
  if (!editSavingsPreview || !editAllowanceInput || !editLimitInput) return;
  const allowance = parseFloat(editAllowanceInput.value) || 0;
  const limit     = parseFloat(editLimitInput.value) || 0;
  const savings   = Math.max(0, allowance - limit);
  editSavingsPreview.textContent = formatRupees(savings);
}

window.setEditAllowance = function(amt) {
  if (editAllowanceInput) {
    editAllowanceInput.value = amt;
    if (editLimitInput && (!editLimitInput.value || parseFloat(editLimitInput.value) === 0)) {
      editLimitInput.value = Math.round(amt * 0.8);
    }
    updateEditSavings();
  }
};

window.setEdit80Percent = function() {
  if (!editAllowanceInput) return;
  const allowance = parseFloat(editAllowanceInput.value);
  if (allowance && allowance > 0) {
    if (editLimitInput) editLimitInput.value = Math.round(allowance * 0.8);
    updateEditSavings();
  } else if (editError) {
    editError.textContent = 'Please enter your monthly allowance first.';
    editError.classList.remove('d-none');
  }
};

if (editAllowanceInput && editLimitInput) {
  editAllowanceInput.addEventListener('input', updateEditSavings);
  editLimitInput.addEventListener('input', updateEditSavings);
}

if (editBudgetModalEl) {
  editBudgetModalEl.addEventListener('show.bs.modal', () => {
    if (editBudgetMonthLabel) {
      editBudgetMonthLabel.textContent = `for ${formatMonthName(currentMonth)}`;
    }
    if (editAllowanceInput) {
      editAllowanceInput.value = currentBudgetData.allowance > 0 ? currentBudgetData.allowance : '';
    }
    if (editLimitInput) {
      editLimitInput.value = currentBudgetData.spending_limit > 0 ? currentBudgetData.spending_limit : '';
    }
    if (editError) {
      editError.classList.add('d-none');
      editError.textContent = '';
    }
    updateEditSavings();
  });
}

if (editBudgetForm) {
  editBudgetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (editError) editError.classList.add('d-none');

    const allowance = parseFloat(editAllowanceInput.value);
    const limit     = parseFloat(editLimitInput.value);

    if (isNaN(allowance) || allowance <= 0) {
      if (editError) {
        editError.textContent = 'Please enter a valid monthly allowance (greater than ₹0).';
        editError.classList.remove('d-none');
      }
      return;
    }
    if (isNaN(limit) || limit < 0) {
      if (editError) {
        editError.textContent = 'Please enter a valid spending limit.';
        editError.classList.remove('d-none');
      }
      return;
    }

    if (editSaveBtn) editSaveBtn.disabled = true;
    if (editSpinner) editSpinner.classList.remove('d-none');

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
        if (editBudgetModal) editBudgetModal.hide();
        if (typeof confetti === 'function') {
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
        }
        document.dispatchEvent(new CustomEvent('budgetSaved', { detail: data }));
        loadDashboard(currentMonth);
      } else {
        if (editError) {
          editError.textContent = data.error || 'Failed to update budget.';
          editError.classList.remove('d-none');
        }
      }
    } catch {
      if (editError) {
        editError.textContent = 'Network error. Please try again.';
        editError.classList.remove('d-none');
      }
    } finally {
      if (editSaveBtn) editSaveBtn.disabled = false;
      if (editSpinner) editSpinner.classList.add('d-none');
    }
  });
}

// ── Reset Month Modal Logic ───────────────────────────────────────────────────

if (resetMonthModalEl) {
  resetMonthModalEl.addEventListener('show.bs.modal', () => {
    const monthFormatted = formatMonthName(currentMonth);
    if (resetModalMonthLabel)  resetModalMonthLabel.textContent  = `for ${monthFormatted}`;
    if (resetWarningMonth)     resetWarningMonth.textContent     = monthFormatted;
    if (resetPreviewMonth)     resetPreviewMonth.textContent     = monthFormatted;
    if (resetPreviewAllowance) resetPreviewAllowance.textContent = formatRupees(currentBudgetData.allowance);
    if (resetPreviewSpent)     resetPreviewSpent.textContent     = statTotalSpent ? statTotalSpent.textContent : '₹0.00';
    if (resetModalError) {
      resetModalError.classList.add('d-none');
      resetModalError.textContent = '';
    }
    const defaultRadio = document.getElementById('resetTypeAll');
    if (defaultRadio) defaultRadio.checked = true;
  });
}

if (resetMonthForm) {
  resetMonthForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (resetModalError) resetModalError.classList.add('d-none');

    const selectedRadio = resetMonthForm.querySelector('input[name="resetType"]:checked');
    const resetType = selectedRadio ? selectedRadio.value : 'all';

    if (resetConfirmBtn) resetConfirmBtn.disabled = true;
    if (resetSpinner)    resetSpinner.classList.remove('d-none');

    try {
      const res = await fetch('/api/reset-month', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          month:      currentMonth,
          reset_type: resetType,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        if (resetMonthModal) resetMonthModal.hide();
        // Dispatch custom events to inform all components
        document.dispatchEvent(new CustomEvent('budgetSaved', { detail: data }));
        document.dispatchEvent(new CustomEvent('expenseDeleted', { detail: data }));
        loadDashboard(currentMonth);
      } else {
        if (resetModalError) {
          resetModalError.textContent = data.error || 'Failed to reset month data.';
          resetModalError.classList.remove('d-none');
        }
      }
    } catch {
      if (resetModalError) {
        resetModalError.textContent = 'Network error. Please try again.';
        resetModalError.classList.remove('d-none');
      }
    } finally {
      if (resetConfirmBtn) resetConfirmBtn.disabled = false;
      if (resetSpinner)    resetSpinner.classList.add('d-none');
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

    // Keep cached for edit modal
    currentBudgetData = {
      allowance: data.allowance || 0,
      spending_limit: data.spending_limit || 0
    };

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

if (monthPicker) {
  monthPicker.addEventListener('change', () => {
    currentMonth = monthPicker.value;
    if (typeof setActiveMonth === 'function') {
      setActiveMonth(currentMonth);
    }
    loadDashboard(currentMonth);
  });
}

document.addEventListener('expenseSaved',   () => loadDashboard(currentMonth));
document.addEventListener('expenseDeleted', () => loadDashboard(currentMonth));
document.addEventListener('budgetSaved',    () => loadDashboard(currentMonth));

window.addEventListener('pageshow', () => {
  const active = (typeof getActiveMonth === 'function') ? getActiveMonth() : currentMonth;
  if (active && active !== currentMonth) {
    currentMonth = active;
    if (monthPicker) monthPicker.value = currentMonth;
  }
  loadDashboard(currentMonth);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const active = (typeof getActiveMonth === 'function') ? getActiveMonth() : currentMonth;
    if (active && active !== currentMonth) {
      currentMonth = active;
      if (monthPicker) monthPicker.value = currentMonth;
    }
    loadDashboard(currentMonth);
  }
});

// ── Initial load ──────────────────────────────────────────────────────────────
loadDashboard(currentMonth);
