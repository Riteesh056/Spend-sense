/**
 * static/js/budget.js
 * ────────────────────
 * Drives the Budget Settings page:
 *  - Loads the current budget for the selected month via GET /api/budgets/<month>
 *  - Loads analytics to show spent / remaining
 *  - Saves budget changes via POST /api/budgets
 */

'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const monthPicker   = document.getElementById('budget-month-picker');
const budgetForm    = document.getElementById('budget-form');
const allowanceInput= document.getElementById('budget-allowance');
const limitInput    = document.getElementById('budget-limit');
const saveBtn       = document.getElementById('budget-save-btn');
const spinner       = document.getElementById('budget-spinner');
const formError     = document.getElementById('budget-form-error');
const formSuccess   = document.getElementById('budget-form-success');
const budgetAlert   = document.getElementById('budget-alert');
const monthLabel    = document.getElementById('budget-form-month-label');

// Summary refs
const bsumAllowance = document.getElementById('bsum-allowance');
const bsumLimit     = document.getElementById('bsum-limit');
const bsumSpent     = document.getElementById('bsum-spent');
const bsumRemaining = document.getElementById('bsum-remaining');
const utilBar       = document.getElementById('util-bar');
const utilPctLabel  = document.getElementById('util-pct-label');
const utilLimitLabel= document.getElementById('util-limit-label');

// ── Load budget + analytics ───────────────────────────────────────────────────

async function loadBudgetPage(month) {
  monthLabel.textContent = formatMonthLabel(month);

  // Load analytics (totals) regardless of whether a budget exists
  try {
    const res  = await fetch(`/api/analytics/${month}`);
    const data = await res.json();
    if (res.ok) renderSummary(data);
  } catch {}

  // Try to load existing budget to pre-fill the form
  try {
    const res = await fetch(`/api/budgets/${month}`);
    if (res.ok) {
      const b = await res.json();
      allowanceInput.value = b.allowance;
      limitInput.value     = b.spending_limit;
    } else {
      allowanceInput.value = '';
      limitInput.value     = '';
    }
  } catch {}
}

function renderSummary(data) {
  bsumAllowance.textContent = formatRupees(data.allowance);
  bsumLimit.textContent     = formatRupees(data.spending_limit);
  bsumSpent.textContent     = formatRupees(data.total_expenses);
  bsumRemaining.textContent = formatRupees(data.remaining_budget);

  bsumRemaining.style.color =
    data.remaining_budget < 0 ? 'var(--color-red)' : 'var(--color-text)';

  const pct = Math.min(data.utilisation_pct, 100);
  utilBar.style.width = pct + '%';
  utilBar.className   = 'progress-bar ' +
    (data.alert_level === 'danger'  ? 'bg-danger'  :
     data.alert_level === 'warning' ? 'bg-warning' : 'bg-success');

  utilPctLabel.textContent   = data.utilisation_pct.toFixed(1) + '%';
  utilLimitLabel.textContent = 'Limit: ' + formatRupees(data.spending_limit);

  // Budget alert banner
  if (data.alert_level === 'normal' || data.spending_limit === 0) {
    budgetAlert.classList.add('d-none');
  } else if (data.alert_level === 'danger') {
    budgetAlert.className = 'alert alert-budget-danger mb-4';
    budgetAlert.innerHTML =
      `<i class="bi bi-exclamation-octagon-fill me-2"></i>
       <strong>Budget Exceeded!</strong>
       You have spent ${formatRupees(data.total_expenses)} against a
       ${formatRupees(data.spending_limit)} limit.`;
  } else {
    budgetAlert.className = 'alert alert-budget-warning mb-4';
    budgetAlert.innerHTML =
      `<i class="bi bi-exclamation-triangle-fill me-2"></i>
       <strong>Warning:</strong>
       ${data.utilisation_pct.toFixed(1)}% of your budget used.
       ${formatRupees(data.remaining_budget)} left.`;
  }
}

// ── Save budget ───────────────────────────────────────────────────────────────

budgetForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.classList.add('d-none');
  formSuccess.classList.add('d-none');

  const allowance = parseFloat(allowanceInput.value);
  const limit     = parseFloat(limitInput.value);

  if (isNaN(allowance) || allowance < 0) {
    formError.textContent = 'Please enter a valid allowance (0 or more).';
    formError.classList.remove('d-none');
    return;
  }
  if (isNaN(limit) || limit < 0) {
    formError.textContent = 'Please enter a valid spending limit (0 or more).';
    formError.classList.remove('d-none');
    return;
  }

  saveBtn.disabled = true;
  spinner.classList.remove('d-none');

  try {
    const res  = await fetch('/api/budgets', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        month:          monthPicker.value,
        allowance:      allowance,
        spending_limit: limit,
      }),
    });
    const data = await res.json();

    if (res.ok) {
      formSuccess.textContent = 'Budget saved successfully!';
      formSuccess.classList.remove('d-none');
      if (typeof setActiveMonth === 'function') {
        setActiveMonth(monthPicker.value);
      }
      if (typeof confetti === 'function') {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      }
      document.dispatchEvent(new CustomEvent('budgetSaved', { detail: data }));
      loadBudgetPage(monthPicker.value);
    } else {
      formError.textContent = data.error || 'Failed to save budget.';
      formError.classList.remove('d-none');
    }
  } catch {
    formError.textContent = 'Network error. Please try again.';
    formError.classList.remove('d-none');
  } finally {
    saveBtn.disabled = false;
    spinner.classList.add('d-none');
  }
});

// ── Reset budget for month ───────────────────────────────────────────────────

const resetBtn = document.getElementById('budget-reset-btn');
if (resetBtn) {
  resetBtn.addEventListener('click', async () => {
    const month = monthPicker.value;
    const formatted = formatMonthLabel(month);
    if (!confirm(`Are you sure you want to reset the budget for ${formatted}? This will clear your allowance and spending limit for this month.`)) {
      return;
    }

    resetBtn.disabled = true;
    try {
      const res = await fetch(`/api/budgets/${month}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        formSuccess.textContent = `Budget for ${formatted} reset successfully.`;
        formSuccess.classList.remove('d-none');
        formError.classList.add('d-none');
        allowanceInput.value = '';
        limitInput.value     = '';
        document.dispatchEvent(new CustomEvent('budgetSaved', { detail: data }));
        loadBudgetPage(month);
      } else {
        formError.textContent = data.error || 'Failed to reset budget.';
        formError.classList.remove('d-none');
      }
    } catch {
      formError.textContent = 'Network error. Please try again.';
      formError.classList.remove('d-none');
    } finally {
      resetBtn.disabled = false;
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMonthLabel(ym) {
  const [y, m] = ym.split('-');
  const dt = new Date(Number(y), Number(m) - 1, 1);
  return dt.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// ── Event listeners ───────────────────────────────────────────────────────────

if (monthPicker && typeof getActiveMonth === 'function') {
  monthPicker.value = getActiveMonth();
}

monthPicker.addEventListener('change', () => {
  if (typeof setActiveMonth === 'function') {
    setActiveMonth(monthPicker.value);
  }
  loadBudgetPage(monthPicker.value);
});

document.addEventListener('expenseSaved',   () => loadBudgetPage(monthPicker.value));
document.addEventListener('expenseDeleted', () => loadBudgetPage(monthPicker.value));
document.addEventListener('budgetSaved',    () => loadBudgetPage(monthPicker.value));

window.addEventListener('pageshow', () => {
  const active = (typeof getActiveMonth === 'function') ? getActiveMonth() : monthPicker.value;
  if (monthPicker && active && active !== monthPicker.value) {
    monthPicker.value = active;
  }
  loadBudgetPage(monthPicker.value);
});

// ── Initial load ──────────────────────────────────────────────────────────────
loadBudgetPage(monthPicker ? monthPicker.value : getActiveMonth());
