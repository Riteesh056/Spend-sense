# SpendSense 💰

> A simple, modern, and practical personal expense tracker and monthly budget management web application built for college students and young adults.

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.1-black.svg)](https://flask.palletsprojects.com/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-lightgrey.svg)](https://www.sqlite.org/)
[![Bootstrap](https://img.shields.io/badge/UI-Bootstrap%205-purple.svg)](https://getbootstrap.com/)
[![Chart.js](https://img.shields.io/badge/Charts-Chart.js%204.4-orange.svg)](https://www.chartjs.org/)
[![Tests](https://img.shields.io/badge/Tests-102%20Passing-brightgreen.svg)](tests/)

---

## 📌 Problem Statement

College students frequently manage fixed pocket money or allowances while spending on food, transit, study materials, shopping, and entertainment. Without active tracking, it is difficult to answer two fundamental questions:
1. *Where did all my money go?*
2. *How much can I safely spend before the month ends?*

## 💡 Solution: SpendSense

**SpendSense** provides an intuitive, lightweight web dashboard where students can:
- Record and categorize daily transactions in Indian Rupees (₹).
- Configure monthly allowances and spending caps per calendar month.
- View real-time budget utilization percentages with intelligent color-coded alerts (Normal, Warning at 80%, Danger at 100%).
- Analyze financial habits through Chart.js category doughnut charts and daily timeline bar graphs.
- Filter, edit, and delete transactions without page reloads.

---

## 🚀 Key Features

* **Real-Time Financial Dashboard**: Instant calculation of total monthly expenditure, remaining pocket money, spending limit, and budget utilization percentage.
* **Smart Budget Threshold Alerts**:
  * 🟢 **Normal (< 80%)**: Safe spending territory.
  * 🟡 **Warning (80% – 99.9%)**: Proactive alert reminding user to pace spending.
  * 🔴 **Exceeded (≥ 100%)**: Critical alert displaying exact excess amount.
* **Precise Currency Arithmetic**: Financial amounts are stored internally as integer **paise** (`₹1.00 = 100 paise`), preventing binary floating-point rounding errors common in monetary software.
* **Data Visualization (Chart.js)**:
  * Dynamic Doughnut chart showing category breakdown.
  * Daily spending bar chart highlighting spending spikes.
  * Empty-state handling when no expenses exist for a month.
* **Full CRUD Expense Management**: Add, view, edit, and delete expenses with modal dialogs and client/server validation.
* **Transaction History & Multi-Criteria Filtering**: Filter by specific calendar month and spending category.
* **Monthly Isolation**: Expenses in one month never interfere with another month's allowance, totals, or analytics.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3, JavaScript (ES6+), Bootstrap 5, Bootstrap Icons |
| **Data Visualization** | Chart.js 4.4 |
| **Backend** | Python 3, Flask 3.1 (Application Factory & Blueprints) |
| **Database** | SQLite 3 with parameterized queries & check constraints |
| **Testing** | Pytest (84 unit and integration test cases) |
| **Deployment Ready** | Gunicorn WSGI server, Render / Railway compatible |

---

## 📂 Project Architecture

```text
spendsense/
│
├── app.py                      # Flask Application Factory & HTML page routes
├── config.py                   # Centralized application and database configuration
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
│   ├── expenses.py             # REST API endpoints for Expense CRUD
│   └── budgets.py              # REST API endpoints for Monthly Budgets
│
├── services/
│   ├── __init__.py
│   └── analytics.py            # Financial math, category aggregations, timeline metrics
│
├── templates/
│   ├── base.html               # Shared layout, navigation sidebar, expense modal
│   ├── dashboard.html          # Main overview, summary cards, and Chart.js canvases
│   ├── transactions.html       # Searchable & filterable transaction log
│   └── budget.html             # Monthly allowance & limit configuration
│
├── static/
│   ├── css/
│   │   └── style.css           # Custom modern UI styling & color tokens
│   └── js/
│       ├── expenses.js         # Shared expense modal logic & event bus
│       ├── dashboard.js        # Analytics fetcher & Chart.js instances
│       ├── transactions.js     # Transaction table rendering & filter handlers
│       └── budget.js           # Budget form submissions & progress bar updates
│
└── tests/
    ├── __init__.py
    ├── test_stage1.py          # Smoke tests for server & page routes
    ├── test_expenses.py        # Comprehensive tests for expense operations & math
    └── test_budgets.py         # Budget validation, upserts & dashboard integration
```

---

## 🗄️ Database Schema

### Table: `expenses`
Stores individual transaction records.
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
Stores monthly budget and allowance settings.
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
pip install -r requirements.txt
pip install pytest
```

### 4. Run the Application
```bash
python app.py
```
Open **[http://localhost:5000](http://localhost:5000)** in your web browser.

---

## 🧪 Running Automated Tests

SpendSense includes an automated test suite with **84 test cases** verifying all business rules, input edge cases, zero-division protections, and month isolation.

Execute tests using pytest:
```bash
pytest tests/ -v
```

### Key Test Coverage:
* Adding, editing, and deleting expenses with persistence verification.
* Rejection of zero, negative, malformed dates, and missing required attributes.
* Integer paise conversion and exact roundings.
* Budget utilization calculations and zero-spending-limit safe fallbacks.
* Multi-month isolation (expenses in October do not modify November's stats).
* Threshold triggers at 80% (Warning) and 100% (Critical Exceeded).

---

## 🌐 API Reference

### Expenses
- `GET /api/expenses?month=YYYY-MM&category=...` — List transactions with optional filters.
- `POST /api/expenses` — Create a transaction.
- `PUT /api/expenses/<id>` — Update an existing transaction.
- `DELETE /api/expenses/<id>` — Delete a transaction.

### Budgets
- `GET /api/budgets/<YYYY-MM>` — Retrieve budget configuration for a specific month.
- `POST /api/budgets` — Create or update budget settings for a month.

### Analytics
- `GET /api/analytics/<YYYY-MM>` — Retrieve aggregated summary, category distribution, and daily timelines for the dashboard.

---

## 🚀 Deployment (e.g. Render, Railway)

To deploy with Gunicorn:
```bash
gunicorn "app:create_app()" --bind 0.0.0.0:$PORT
```
In your cloud dashboard, add an environment variable `SECRET_KEY` with a secure random key.

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
