/**
 * static/js/transactions.js
 * ─────────────────────────
 * Drives the Transactions page:
 *  - Fetches expenses from /api/expenses with month + category filters
 *  - Renders the table
 *  - Wires up edit (opens shared modal) and delete buttons
 */

'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const filterMonth    = document.getElementById('filter-month');
const filterCategory = document.getElementById('filter-category');
const clearFiltersBtn= document.getElementById('clear-filters-btn');
const txBody         = document.getElementById('tx-body');
const txEmpty        = document.getElementById('tx-empty');
const txTable        = document.getElementById('tx-table');

// ── Fetch & render ────────────────────────────────────────────────────────────

async function loadTransactions() {
  const month    = filterMonth.value;
  const category = filterCategory.value;

  let url = '/api/expenses?';
  if (month)    url += `month=${month}&`;
  if (category) url += `category=${encodeURIComponent(category)}&`;

  try {
    const res  = await fetch(url);
    const data = await res.json();

    if (!res.ok) { console.error(data.error); return; }

    renderTable(data);
  } catch (err) {
    console.error('Failed to load transactions:', err);
  }
}

function renderTable(expenses) {
  // Cache for handleEdit lookup
  _loadedExpenses = expenses || [];

  const empty = _loadedExpenses.length === 0;

  txEmpty.classList.toggle('d-none', !empty);
  txTable.classList.toggle('d-none',  empty);

  if (empty) { txBody.innerHTML = ''; return; }

  txBody.innerHTML = expenses.map(exp => `
    <tr>
      <td class="ps-4">
        <span class="fw-semibold">${formatDate(exp.expense_date)}</span>
      </td>
      <td>
        <span class="badge rounded-pill px-3 py-1 fw-semibold ${categoryBadgeClass(exp.category)}">
          ${categoryIcon(exp.category)} ${exp.category}
        </span>
      </td>
      <td class="text-muted">${exp.note ? escapeHtml(exp.note) : '—'}</td>
      <td class="text-end fw-bold" style="color:var(--color-red);">
        ${formatRupees(exp.amount)}
      </td>
      <td class="text-center pe-4">
        <button class="btn btn-sm btn-outline-primary me-1"
                onclick="handleEdit(${exp.id})"
                title="Edit">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger"
                onclick="deleteExpense(${exp.id})"
                title="Delete">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

// ── Edit flow ─────────────────────────────────────────────────────────────────

// Keep a reference to the currently loaded expenses so we can look up by ID
// without an extra fetch.
let _loadedExpenses = [];

async function handleEdit(id) {
  // Try to find the expense in the already-loaded data first
  let exp = _loadedExpenses.find(e => e.id === id);

  if (!exp) {
    // Fallback: fetch all and find
    try {
      const res = await fetch('/api/expenses');
      const all = await res.json();
      exp = all.find(e => e.id === id);
    } catch (err) {
      alert('Could not load expense for editing.');
      return;
    }
  }

  if (exp) {
    openEditExpenseModal(exp);
  } else {
    alert('Expense not found.');
  }
}

function formatDate(iso) {
  const dt = new Date(iso + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Initial Month Sync ────────────────────────────────────────────────────────
if (filterMonth && typeof getActiveMonth === 'function') {
  filterMonth.value = getActiveMonth();
}

// ── Event listeners ───────────────────────────────────────────────────────────

filterMonth.addEventListener('change', () => {
  if (typeof setActiveMonth === 'function') {
    setActiveMonth(filterMonth.value);
  }
  loadTransactions();
});
filterCategory.addEventListener('change', loadTransactions);

clearFiltersBtn.addEventListener('click', () => {
  const m = (typeof getActiveMonth === 'function') ? getActiveMonth() : new Date().toISOString().slice(0, 7);
  filterMonth.value    = m;
  filterCategory.value = '';
  loadTransactions();
});

const resetMonthTxBtn = document.getElementById('reset-month-tx-btn');
if (resetMonthTxBtn) {
  resetMonthTxBtn.addEventListener('click', async () => {
    const month = filterMonth.value;
    if (!month) {
      alert('Please select a valid month first.');
      return;
    }
    const [y, m] = month.split('-');
    const dt = new Date(Number(y), Number(m) - 1, 1);
    const monthName = dt.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    if (!confirm(`Are you sure you want to delete ALL transactions for ${monthName}? This cannot be undone.`)) {
      return;
    }

    resetMonthTxBtn.disabled = true;
    try {
      const res = await fetch('/api/reset-month', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ month: month, reset_type: 'expenses' }),
      });
      const data = await res.json();
      if (res.ok) {
        document.dispatchEvent(new CustomEvent('expenseDeleted', { detail: data }));
        loadTransactions();
      } else {
        alert(data.error || 'Failed to reset transactions.');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      resetMonthTxBtn.disabled = false;
    }
  });
}

document.addEventListener('expenseSaved',   loadTransactions);
document.addEventListener('expenseDeleted', loadTransactions);

window.addEventListener('pageshow', () => {
  const active = (typeof getActiveMonth === 'function') ? getActiveMonth() : filterMonth.value;
  if (filterMonth && active && active !== filterMonth.value) {
    filterMonth.value = active;
  }
  loadTransactions();
});

// ── Initial load ──────────────────────────────────────────────────────────────
loadTransactions();
