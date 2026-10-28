/**
 * static/js/expenses.js
 * ─────────────────────
 * Shared logic for the Add / Edit Expense modal.
 *
 * This file is loaded on every page (via base.html) because the "Add Expense"
 * button lives in the base layout.  It exposes two globals that page-specific
 * scripts can call:
 *
 *   openAddExpenseModal()          – open modal in "add" mode
 *   openEditExpenseModal(expense)  – open modal pre-filled for editing
 *
 * After a successful save the browser fires a custom event so the current
 * page can refresh its data without a full reload:
 *
 *   document.dispatchEvent(new CustomEvent('expenseSaved'))
 *   document.dispatchEvent(new CustomEvent('expenseDeleted'))
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_KEY_MONTH = 'spendsense_active_month';

/**
 * Get the currently active month:
 * 1. URL search param ?month=YYYY-MM
 * 2. localStorage saved month
 * 3. Default to current month (YYYY-MM)
 */
function getActiveMonth() {
  const urlParams = new URLSearchParams(window.location.search);
  const qMonth = urlParams.get('month');
  if (qMonth && /^\d{4}-\d{2}$/.test(qMonth)) {
    try { localStorage.setItem(STORAGE_KEY_MONTH, qMonth); } catch {}
    return qMonth;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY_MONTH);
    if (saved && /^\d{4}-\d{2}$/.test(saved)) {
      return saved;
    }
  } catch {}
  return new Date().toISOString().slice(0, 7);
}

/**
 * Save active month to storage and sync all navigation links across the app.
 */
function setActiveMonth(month) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return;
  try { localStorage.setItem(STORAGE_KEY_MONTH, month); } catch {}
  syncNavigationLinks(month);
}

/**
 * Update all navigation & page links so clicking Dashboard, Transactions,
 * or Budget always preserves the selected calendar month.
 */
function syncNavigationLinks(month) {
  if (!month) month = getActiveMonth();

  // Update navigation links
  document.querySelectorAll('a.nav-link, a.sidebar-link, a.navbar-brand').forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    const basePaths = ['/', '/transactions', '/budget'];
    for (const p of basePaths) {
      if (href === p || href.startsWith(p + '?')) {
        link.setAttribute('href', `${p}?month=${month}`);
        break;
      }
    }
  });

  // Also update header buttons and view all link if present
  const viewAll = document.getElementById('view-all-tx-link');
  if (viewAll) viewAll.setAttribute('href', `/transactions?month=${month}`);

  const headerBudget = document.getElementById('header-budget-btn');
  if (headerBudget) headerBudget.setAttribute('href', `/budget?month=${month}`);
}

// Automatically sync on initial load
document.addEventListener('DOMContentLoaded', () => {
  syncNavigationLinks(getActiveMonth());
});

/** Format a number as Indian rupees: ₹1,234.56 */
function formatRupees(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Return today's date as YYYY-MM-DD (for the date-input default). */
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/** Escape HTML special characters to prevent XSS when injecting text. */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/** Map category name → CSS badge class */
function categoryBadgeClass(cat) {
  const map = {
    'Food':                  'badge-food',
    'Transport':             'badge-transport',
    'Education':             'badge-education',
    'Shopping':              'badge-shopping',
    'Entertainment':         'badge-entertainment',
    'Bills & Subscriptions': 'badge-bills',
    'Health & Personal Care':'badge-health',
    'Other':                 'badge-other',
  };
  return map[cat] || 'badge-other';
}

/** Map category → emoji icon for the tx-icon bubble */
function categoryIcon(cat) {
  const map = {
    'Food':                  '🍔',
    'Transport':             '🚌',
    'Education':             '📚',
    'Shopping':              '🛍️',
    'Entertainment':         '🎬',
    'Bills & Subscriptions': '📄',
    'Health & Personal Care':'💊',
    'Other':                 '📦',
  };
  return map[cat] || '💰';
}

// ── Modal logic ───────────────────────────────────────────────────────────────

const expenseModal       = document.getElementById('expenseModal');
const expenseForm        = document.getElementById('expense-form');
const expenseIdInput     = document.getElementById('expense-id');
const expenseAmountInput = document.getElementById('expense-amount');
const expenseCategorySel = document.getElementById('expense-category');
const expenseDateInput   = document.getElementById('expense-date');
const expenseNoteInput   = document.getElementById('expense-note');
const expenseError       = document.getElementById('expense-form-error');
const expenseSubmitBtn   = document.getElementById('expense-submit-btn');
const expenseSpinner     = document.getElementById('expense-spinner');
const expenseModalLabel  = document.getElementById('expenseModalLabel');
const bsModal            = expenseModal ? new bootstrap.Modal(expenseModal) : null;

function clearExpenseForm() {
  expenseForm.reset();
  expenseIdInput.value = '';

  // Smart date default: use today if viewing current month, or the 1st of the active month
  const activeMonth = getActiveMonth();
  const today = todayISO();
  if (today.startsWith(activeMonth)) {
    expenseDateInput.value = today;
  } else {
    expenseDateInput.value = `${activeMonth}-01`;
  }

  expenseError.classList.add('d-none');
  expenseError.textContent = '';
}

function openAddExpenseModal() {
  clearExpenseForm();
  expenseModalLabel.textContent = 'Add Expense';
  expenseSubmitBtn.querySelector('.btn-text').textContent = 'Save Expense';
  bsModal.show();
}

function openEditExpenseModal(expense) {
  clearExpenseForm();
  expenseModalLabel.textContent = 'Edit Expense';
  expenseSubmitBtn.querySelector('.btn-text').textContent = 'Update Expense';
  expenseIdInput.value       = expense.id;
  expenseAmountInput.value   = expense.amount;       // already in rupees
  expenseCategorySel.value   = expense.category;
  expenseDateInput.value     = expense.expense_date;
  expenseNoteInput.value     = expense.note || '';
  bsModal.show();
}

function setExpenseFormLoading(loading) {
  expenseSubmitBtn.disabled = loading;
  expenseSpinner.classList.toggle('d-none', !loading);
}

if (expenseForm) {
  expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    expenseError.classList.add('d-none');

    const amount = parseFloat(expenseAmountInput.value);
    if (!amount || amount <= 0) {
      expenseError.textContent = 'Please enter a valid amount greater than ₹0.';
      expenseError.classList.remove('d-none');
      return;
    }
    if (!expenseCategorySel.value) {
      expenseError.textContent = 'Please select a category.';
      expenseError.classList.remove('d-none');
      return;
    }
    if (!expenseDateInput.value) {
      expenseError.textContent = 'Please select a date.';
      expenseError.classList.remove('d-none');
      return;
    }

    const id      = expenseIdInput.value;
    const payload = {
      amount:       amount,
      category:     expenseCategorySel.value,
      expense_date: expenseDateInput.value,
      note:         expenseNoteInput.value.trim(),
    };

    const url    = id ? `/api/expenses/${id}` : '/api/expenses';
    const method = id ? 'PUT' : 'POST';

    setExpenseFormLoading(true);
    try {
      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        expenseError.textContent = data.error || 'Failed to save expense.';
        expenseError.classList.remove('d-none');
      } else {
        bsModal.hide();
        document.dispatchEvent(new CustomEvent('expenseSaved', { detail: data }));
      }
    } catch (err) {
      expenseError.textContent = 'Network error. Please try again.';
      expenseError.classList.remove('d-none');
    } finally {
      setExpenseFormLoading(false);
    }
  });
}

/** Delete an expense by ID and fire 'expenseDeleted' event on success. */
async function deleteExpense(id) {
  if (!confirm('Delete this expense? This cannot be undone.')) return;
  try {
    const res  = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      document.dispatchEvent(new CustomEvent('expenseDeleted', { detail: { id } }));
    } else {
      alert(data.error || 'Failed to delete expense.');
    }
  } catch {
    alert('Network error. Could not delete expense.');
  }
}

// Set default date whenever the modal opens fresh
if (expenseModal) {
  expenseModal.addEventListener('show.bs.modal', () => {
    if (!expenseIdInput.value) {
      expenseDateInput.value = todayISO();
    }
  });
}
