# SpendSense 💰

> A simple, modern, and practical personal expense tracker and monthly budget management web application built for college students and young adults.

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.1-black.svg)](https://flask.palletsprojects.com/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-lightgrey.svg)](https://www.sqlite.org/)
[![Bootstrap](https://img.shields.io/badge/UI-Bootstrap%205-purple.svg)](https://getbootstrap.com/)
[![Chart.js](https://img.shields.io/badge/Charts-Chart.js%204.4-orange.svg)](https://www.chartjs.org/)
[![Tests](https://img.shields.io/badge/Tests-110%20Passing-brightgreen.svg)](tests/)

---

## 📌 Problem Statement

College students frequently manage fixed pocket money or monthly allowances while juggling expenses across food, transit, study materials, shopping, bills, and entertainment. Without active tracking, it is difficult to answer two fundamental financial questions:
1. *Where did all my money go?*
2. *How much can I safely spend before the month ends?*

## 💡 Solution: SpendSense

**SpendSense** provides an intuitive, lightweight, and responsive web dashboard where students can:
- Record, categorize, and annotate daily transactions in Indian Rupees (`₹`).
- Set monthly pocket money allowances and spending limits with smart presets.
- View real-time budget utilization percentages with intelligent color-coded alerts (Normal, Warning at 80%, Danger at 100%).
- Analyze financial patterns through Chart.js category doughnut charts and daily timeline bar charts.
- Smoothly filter, edit, delete, and reset transactions without full page reloads.

---

## 🚀 Key Features

* **Step 1 Budget Onboarding Gateway**:
  * Before unlocking the dashboard for any calendar month, users configure their monthly allowance and spending boundary.
  * Includes quick presets (`₹5k`, `₹8k`, `₹10k`, `₹15k`, `₹20k`), an **80% Recommended Limit** calculation button, and live savings projections.
  * Rewarded with celebratory confetti animations upon completion.
* **Real-Time Financial Dashboard**:
  * Live cards displaying Monthly Allowance, Total Spent, Remaining Pocket Money, and Budget Utilization percentage.
  * Real-time progress bar with dynamic color changes based on spending pace.
  * Quick-access **"Edit Budget"** inline modal directly on the dashboard.
* **Smart Budget Threshold Alerts**:
  * 🟢 **Normal (< 80%)**: Safe spending territory.
  * 🟡 **Warning (80% – 99.9%)**: Proactive alert reminding user to pace spending.
  * 🔴 **Exceeded (≥ 100%)**: Critical alert displaying exact excess amount.
* **Granular Monthly Reset Option**:
  * Dedicated **Reset Month** modal accessible directly from the dashboard header, budget settings, and transactions view.
  * Three flexible reset options:
    1. 🔴 **Reset Everything for this Month**: Clears budget settings and deletes all expenses for the selected month, returning to the Step 1 Gateway.
    2. 🟡 **Reset Budget Only**: Clears allowance and limit to allow re-configuration while preserving all transactions.
    3. 🟠 **Reset Expenses Only**: Wipes out all transactions for the month while keeping the budget intact.
  * Strict month-to-month data isolation guarantees that other months remain untouched.
* **Cross-Page Calendar Month Synchronization**:
  * Selecting a month in the calendar picker synchronizes the active month across the Dashboard, Transactions ledger, and Budget page via `localStorage` and URL parameters.
* **Precise Currency Arithmetic**:
  * Financial amounts are stored internally as integer **paise** (`₹1.00 = 100 paise`), preventing floating-point rounding bugs common in financial software.
* **Interactive Data Visualization (Chart.js)**:
  * Dynamic Doughnut chart showing spending distribution by category.
  * Daily timeline Bar chart highlighting spending peaks.
  * Actionable empty-state illustrations when no expenses exist for a month.
* **Full CRUD Expense Management**:
  * Add, view, edit, and delete expenses with modal dialogs, category badges, and client/server validation.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3, JavaScript (ES6+), Bootstrap 5.3, Bootstrap Icons 1.11 |
| **Typography & Styling** | Google Fonts (Plus Jakarta Sans, Inter), Modern Layered Shadows, Custom Color Tokens |
| **Data Visualization & FX** | Chart.js 4.4, Canvas Confetti |
| **Backend** | Python 3.10+, Flask 3.1 (Application Factory & Blueprints) |
| **Database** | SQLite 3 with parameterized queries & check constraints |
| **Testing** | Pytest (110 comprehensive unit and integration test cases) |
| **Deployment Ready** | Gunicorn WSGI server, Procfile, Render / Railway compatible |

---

## 📂 Project Architecture

```text
spendsense/
│
├── app.py                      # Flask Application Factory & HTML page routes
├── config.py                   # Centralized application and database configuration
├── Procfile                    # Production process definition for Gunicorn
├── render.yaml                 # Render cloud deployment blueprint
├── requirements.txt            # Production and development dependencies
├── README.md                   # Project documentation
├── .gitignore                  # Git exclusion rules
│
├── data/
│   └── spendsense.db           # SQLite database (auto-generated on launch)
│
├── database/
│   ├── __init__.py
│   ├── db.py                   # Context-aware DB connection management
│   └── schema.sql              # Table DDL & integrity constraints
│
├── routes/
│   ├── __init__.py
│   ├── expenses.py             # REST API endpoints for Expense CRUD & monthly delete
│   └── budgets.py              # REST API endpoints for Monthly Budgets & Reset Month
│
├── services/
│   ├── __init__.py
│   └── analytics.py            # Financial math, category aggregations, timeline metrics
│
├── templates/
│   ├── base.html               # Shared layout, navigation sidebar, expense modal
│   ├── dashboard.html          # Gateway card, summary cards, charts, and reset/edit modals
│   ├── transactions.html       # Searchable & filterable transaction log with reset button
│   └── budget.html             # Monthly allowance & limit configuration with reset
│
├── static/
│   ├── css/
│   │   └── style.css           # Custom modern UI styling & color tokens
│   └── js/
│       ├── expenses.js         # Shared expense modal logic & active month synchronization
│       ├── dashboard.js        # Analytics fetcher, Chart.js instances, gateway, and reset handlers
│       ├── transactions.js     # Transaction table rendering, filters, and month reset
│       └── budget.js           # Budget form submissions, presets, and budget reset
│
└── tests/
    ├── __init__.py
    ├── test_stage1.py          # Smoke tests for server & page routes
    ├── test_expenses.py        # Comprehensive tests for expense operations & math
    ├── test_budgets.py         # Budget validation, upserts & dashboard integration
    ├── test_edge_cases.py      # Precision, SQL injection, XSS, and boundary tests
    └── test_reset.py           # Monthly reset endpoints & cross-month isolation tests
```

---

## 🗄️ Database Schema

### Table: `expenses`
Stores individual transaction records backed by integer paise.
```sql
CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    category     TEXT    NOT NULL,
    note         TEXT,
    expense_date TEXT    NOT NULL,   -- YYYY-MM-DD
    created_at   TEXT    NOT NULL    -- YYYY-MM-DD HH:MM:SS
);
```

### Table: `monthly_budgets`
Stores monthly budget and allowance settings with unique month isolation.
```sql
CREATE TABLE IF NOT EXISTS monthly_budgets (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    month                TEXT    NOT NULL UNIQUE,  -- YYYY-MM
    allowance_paise      INTEGER NOT NULL CHECK (allowance_paise >= 0),
    spending_limit_paise INTEGER NOT NULL CHECK (spending_limit_paise >= 0),
    created_at           TEXT    NOT NULL,
    updated_at           TEXT    NOT NULL
);
```

---

## ⚙️ Installation & Local Setup

### Prerequisites
- Python 3.10 or higher
- Git

### 1. Clone the repository
```bash
git clone https://github.com/your-username/spendsense.git
cd spendsense
```

### 2. Create and activate a Virtual Environment

**On Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**On macOS / Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
python -m pip install -r requirements.txt
python -m pip install pytest
```

### 4. Run the Application
```bash
python app.py
```
Open **[http://localhost:5000](http://localhost:5000)** in your web browser.

---

## 🧪 Running Automated Tests

SpendSense includes a comprehensive test suite of **110 passing test cases** verifying all business rules, input sanitization, zero-division protections, cross-month isolation, and reset endpoints.

Execute tests using pytest:
```bash
pytest tests/ -v
```

### Key Test Coverage:
* **Expense Operations**: Add, edit, and delete transactions with persistence checks.
* **Input Validation**: Strict validation against zero, negative amounts, invalid dates, and SQL/XSS payloads.
* **Financial Precision**: Integer paise storage, exact rounding, and sub-paisa protection.
* **Budget Metrics**: Utilization calculations, zero-limit protection, and threshold alerts at 80% and 100%.
* **Month Isolation**: Guarantees that actions in one calendar month do not alter another month's data.
* **Monthly Reset**: Verifies complete reset, budget-only reset, and expenses-only reset while ensuring other months remain intact.

---

## 🌐 REST API Reference

### Expenses
- `GET /api/expenses?month=YYYY-MM&category=...` — List transactions with optional month & category filters.
- `POST /api/expenses` — Create a transaction (`amount`, `category`, `expense_date`, `note`).
- `PUT /api/expenses/<id>` — Update an existing transaction.
- `DELETE /api/expenses/<id>` — Delete a specific transaction by ID.
- `DELETE /api/expenses/month/<YYYY-MM>` — Bulk-delete all transactions for a specific month.

### Budgets
- `GET /api/budgets/<YYYY-MM>` — Retrieve budget configuration for a specific month.
- `POST /api/budgets` — Create or update budget settings (`month`, `allowance`, `spending_limit`).
- `DELETE /api/budgets/<YYYY-MM>` — Clear budget settings for a specific month.

### Month Reset
- `POST /api/reset-month` — Reset data for a given month with target scope:
  ```json
  {
    "month": "2026-10",
    "reset_type": "all" // "all" | "budget" | "expenses"
  }
  ```

### Analytics
- `GET /api/analytics/<YYYY-MM>` — Retrieve aggregated summary, category distribution, daily timelines, and recent transactions for the active month.

---

## 🚀 Deployment (e.g. Render, Railway)

To deploy with Gunicorn:
```bash
gunicorn "app:create_app()" --bind 0.0.0.0:$PORT
```
In your cloud deployment dashboard, configure the environment variable:
* `SECRET_KEY`: A cryptographically secure random secret string.

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
