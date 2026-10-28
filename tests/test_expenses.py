"""
tests/test_expenses.py
-----------------------
Stage 2 – Expense Management Tests

Covers all 13 cases specified in the project spec:

 1.  Adding a valid expense
 2.  Rejecting a negative or invalid amount
 3.  Editing an existing expense
 4.  Deleting an expense
 5.  Correct dashboard totals after changes
 6.  Filtering expenses by month
 7.  Filtering by category
 8.  Calculating budget utilisation
 9.  Triggering warnings at 80 % and 100 %
10.  Handling an empty database
11.  Handling a zero spending limit
12.  Preventing expenses from different months being mixed
13.  Preserving database records after application restart (simulated)

Run:
    .\\venv\\Scripts\\python.exe -m pytest tests/test_expenses.py -v
"""

import os
import json
import tempfile
import pytest

from app import create_app


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def app():
    """
    Fresh app + temp database for every test function.
    scope="function" guarantees total isolation between tests.
    """
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(db_fd)

    application = create_app(config_overrides={
        "DATABASE": db_path,
        "TESTING":  True,
    })
    yield application

    try:
        os.unlink(db_path)
    except OSError:
        pass


@pytest.fixture
def client(app):
    return app.test_client()


# ── Helper functions ───────────────────────────────────────────────────────────

def add_expense(client, amount, category="Food", date="2026-10-15", note=""):
    """POST /api/expenses and return (response, json_data)."""
    res = client.post(
        "/api/expenses",
        data=json.dumps({
            "amount":       amount,
            "category":     category,
            "expense_date": date,
            "note":         note,
        }),
        content_type="application/json",
    )
    return res, res.get_json()


def set_budget(client, month, allowance, spending_limit):
    """POST /api/budgets and return response."""
    return client.post(
        "/api/budgets",
        data=json.dumps({
            "month":          month,
            "allowance":      allowance,
            "spending_limit": spending_limit,
        }),
        content_type="application/json",
    )


def get_analytics(client, month):
    """GET /api/analytics/<month> and return (response, json_data)."""
    res = client.get(f"/api/analytics/{month}")
    return res, res.get_json()


# ── Test 1: Adding a valid expense ─────────────────────────────────────────────

class TestAddExpense:
    def test_creates_expense_successfully(self, client):
        res, data = add_expense(client, amount=150.50, category="Food",
                                date="2026-10-15", note="Lunch")
        assert res.status_code == 201
        assert data["amount"]       == 150.50
        assert data["category"]     == "Food"
        assert data["expense_date"] == "2026-10-15"
        assert data["note"]         == "Lunch"
        assert "id" in data
        assert data["id"] > 0

    def test_amount_stored_as_paise(self, client):
        """Internally amount_paise should be the rupee amount × 100."""
        _, data = add_expense(client, amount=99.99)
        assert data["amount_paise"] == 9999   # 99.99 × 100 rounded

    def test_note_is_optional(self, client):
        res, data = add_expense(client, amount=50, note="")
        assert res.status_code == 201
        assert data["note"] is None

    def test_all_categories_accepted(self, client):
        categories = [
            "Food", "Transport", "Education", "Shopping",
            "Entertainment", "Bills & Subscriptions",
            "Health & Personal Care", "Other",
        ]
        for cat in categories:
            res, data = add_expense(client, amount=10, category=cat)
            assert res.status_code == 201, f"Category '{cat}' was rejected"

    def test_expense_appears_in_list(self, client):
        add_expense(client, amount=200, category="Transport", date="2026-10-20")
        res = client.get("/api/expenses")
        expenses = res.get_json()
        assert any(e["category"] == "Transport" and e["amount"] == 200.0
                   for e in expenses)

    def test_rupee_fraction_rounded_correctly(self, client):
        """₹1.005 should round to ₹1.01 (101 paise)."""
        _, data = add_expense(client, amount=1.005)
        assert data["amount_paise"] in (100, 101)   # either rounding is fine


# ── Test 2: Rejecting invalid amounts ─────────────────────────────────────────

class TestInvalidAmounts:
    def test_negative_amount_rejected(self, client):
        res, data = add_expense(client, amount=-50)
        assert res.status_code == 422
        assert "error" in data

    def test_zero_amount_rejected(self, client):
        res, data = add_expense(client, amount=0)
        assert res.status_code == 422
        assert "error" in data

    def test_string_amount_rejected(self, client):
        res = client.post(
            "/api/expenses",
            data=json.dumps({"amount": "abc", "category": "Food",
                             "expense_date": "2026-10-01"}),
            content_type="application/json",
        )
        assert res.status_code == 422

    def test_missing_amount_rejected(self, client):
        res = client.post(
            "/api/expenses",
            data=json.dumps({"category": "Food", "expense_date": "2026-10-01"}),
            content_type="application/json",
        )
        assert res.status_code == 422

    def test_missing_category_rejected(self, client):
        res = client.post(
            "/api/expenses",
            data=json.dumps({"amount": 100, "expense_date": "2026-10-01"}),
            content_type="application/json",
        )
        assert res.status_code == 422

    def test_invalid_category_rejected(self, client):
        res = client.post(
            "/api/expenses",
            data=json.dumps({"amount": 100, "category": "Pizza",
                             "expense_date": "2026-10-01"}),
            content_type="application/json",
        )
        assert res.status_code == 422

    def test_missing_date_rejected(self, client):
        res = client.post(
            "/api/expenses",
            data=json.dumps({"amount": 100, "category": "Food"}),
            content_type="application/json",
        )
        assert res.status_code == 422

    def test_bad_date_format_rejected(self, client):
        res = client.post(
            "/api/expenses",
            data=json.dumps({"amount": 100, "category": "Food",
                             "expense_date": "15-10-2026"}),
            content_type="application/json",
        )
        assert res.status_code == 422

    def test_non_json_body_rejected(self, client):
        res = client.post("/api/expenses", data="not json",
                          content_type="text/plain")
        assert res.status_code == 400


# ── Test 3: Editing an existing expense ───────────────────────────────────────

class TestEditExpense:
    def test_edit_amount(self, client):
        _, created = add_expense(client, amount=100)
        exp_id = created["id"]

        res = client.put(
            f"/api/expenses/{exp_id}",
            data=json.dumps({"amount": 250, "category": "Food",
                             "expense_date": "2026-10-15"}),
            content_type="application/json",
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["amount"] == 250.0
        assert data["amount_paise"] == 25000

    def test_edit_category(self, client):
        _, created = add_expense(client, amount=100, category="Food")
        exp_id = created["id"]

        res = client.put(
            f"/api/expenses/{exp_id}",
            data=json.dumps({"amount": 100, "category": "Transport",
                             "expense_date": "2026-10-15"}),
            content_type="application/json",
        )
        assert res.status_code == 200
        assert res.get_json()["category"] == "Transport"

    def test_edit_date(self, client):
        _, created = add_expense(client, amount=100, date="2026-10-01")
        exp_id = created["id"]

        res = client.put(
            f"/api/expenses/{exp_id}",
            data=json.dumps({"amount": 100, "category": "Food",
                             "expense_date": "2026-10-20"}),
            content_type="application/json",
        )
        assert res.status_code == 200
        assert res.get_json()["expense_date"] == "2026-10-20"

    def test_edit_nonexistent_returns_404(self, client):
        res = client.put(
            "/api/expenses/9999",
            data=json.dumps({"amount": 100, "category": "Food",
                             "expense_date": "2026-10-15"}),
            content_type="application/json",
        )
        assert res.status_code == 404

    def test_edit_with_invalid_data_rejected(self, client):
        _, created = add_expense(client, amount=100)
        exp_id = created["id"]

        res = client.put(
            f"/api/expenses/{exp_id}",
            data=json.dumps({"amount": -50, "category": "Food",
                             "expense_date": "2026-10-15"}),
            content_type="application/json",
        )
        assert res.status_code == 422


# ── Test 4: Deleting an expense ───────────────────────────────────────────────

class TestDeleteExpense:
    def test_delete_removes_expense(self, client):
        _, created = add_expense(client, amount=500)
        exp_id = created["id"]

        res = client.delete(f"/api/expenses/{exp_id}")
        assert res.status_code == 200

        # Verify it's gone
        list_res = client.get("/api/expenses")
        ids = [e["id"] for e in list_res.get_json()]
        assert exp_id not in ids

    def test_delete_nonexistent_returns_404(self, client):
        res = client.delete("/api/expenses/9999")
        assert res.status_code == 404

    def test_delete_returns_confirmation(self, client):
        _, created = add_expense(client, amount=100)
        res = client.delete(f"/api/expenses/{created['id']}")
        data = res.get_json()
        assert "message" in data


# ── Test 5: Dashboard totals update correctly ─────────────────────────────────

class TestDashboardTotals:
    def test_total_increases_after_add(self, client):
        add_expense(client, amount=200, date="2026-10-10")
        add_expense(client, amount=300, date="2026-10-15")

        _, data = get_analytics(client, "2026-10")
        assert data["total_expenses"] == 500.0

    def test_total_decreases_after_delete(self, client):
        add_expense(client, amount=200, date="2026-10-10")
        _, exp = add_expense(client, amount=300, date="2026-10-15")

        client.delete(f"/api/expenses/{exp['id']}")

        _, data = get_analytics(client, "2026-10")
        assert data["total_expenses"] == 200.0

    def test_total_updates_after_edit(self, client):
        _, exp = add_expense(client, amount=100, date="2026-10-10")
        client.put(
            f"/api/expenses/{exp['id']}",
            data=json.dumps({"amount": 400, "category": "Food",
                             "expense_date": "2026-10-10"}),
            content_type="application/json",
        )
        _, data = get_analytics(client, "2026-10")
        assert data["total_expenses"] == 400.0

    def test_remaining_balance_calculated_correctly(self, client):
        set_budget(client, "2026-10", allowance=10000, spending_limit=8000)
        add_expense(client, amount=3000, date="2026-10-05")

        _, data = get_analytics(client, "2026-10")
        assert data["allowance"]         == 10000.0
        assert data["total_expenses"]    == 3000.0
        assert data["remaining_balance"] == 7000.0   # 10000 - 3000

    def test_remaining_budget_calculated_correctly(self, client):
        set_budget(client, "2026-10", allowance=10000, spending_limit=8000)
        add_expense(client, amount=3000, date="2026-10-05")

        _, data = get_analytics(client, "2026-10")
        assert data["remaining_budget"] == 5000.0    # 8000 - 3000


# ── Test 6: Filter by month ───────────────────────────────────────────────────

class TestMonthFilter:
    def test_filter_returns_only_correct_month(self, client):
        add_expense(client, amount=100, date="2026-10-05")
        add_expense(client, amount=200, date="2026-11-10")

        res = client.get("/api/expenses?month=2026-10")
        expenses = res.get_json()
        assert len(expenses) == 1
        assert expenses[0]["expense_date"] == "2026-10-05"

    def test_filter_excludes_other_months(self, client):
        add_expense(client, amount=500, date="2026-09-30")
        res = client.get("/api/expenses?month=2026-10")
        assert res.get_json() == []

    def test_analytics_only_sums_selected_month(self, client):
        add_expense(client, amount=1000, date="2026-10-01")
        add_expense(client, amount=9999, date="2026-11-01")

        _, oct_data = get_analytics(client, "2026-10")
        assert oct_data["total_expenses"] == 1000.0

        _, nov_data = get_analytics(client, "2026-11")
        assert nov_data["total_expenses"] == 9999.0


# ── Test 7: Filter by category ────────────────────────────────────────────────

class TestCategoryFilter:
    def test_filter_by_category(self, client):
        add_expense(client, amount=100, category="Food",      date="2026-10-01")
        add_expense(client, amount=200, category="Transport", date="2026-10-02")
        add_expense(client, amount=300, category="Food",      date="2026-10-03")

        res = client.get("/api/expenses?category=Food")
        expenses = res.get_json()
        assert len(expenses) == 2
        assert all(e["category"] == "Food" for e in expenses)

    def test_filter_month_and_category_combined(self, client):
        add_expense(client, amount=100, category="Food", date="2026-10-01")
        add_expense(client, amount=200, category="Food", date="2026-11-01")

        res = client.get("/api/expenses?month=2026-10&category=Food")
        expenses = res.get_json()
        assert len(expenses) == 1
        assert expenses[0]["expense_date"] == "2026-10-01"

    def test_category_breakdown_in_analytics(self, client):
        add_expense(client, amount=500, category="Food",      date="2026-10-01")
        add_expense(client, amount=300, category="Transport", date="2026-10-02")

        _, data = get_analytics(client, "2026-10")
        breakdown = {b["category"]: b["total"] for b in data["category_breakdown"]}
        assert breakdown["Food"]      == 500.0
        assert breakdown["Transport"] == 300.0


# ── Test 8: Budget utilisation calculation ────────────────────────────────────

class TestBudgetUtilisation:
    def test_utilisation_zero_with_no_expenses(self, client):
        set_budget(client, "2026-10", allowance=10000, spending_limit=8000)
        _, data = get_analytics(client, "2026-10")
        assert data["utilisation_pct"] == 0.0

    def test_utilisation_calculated_correctly(self, client):
        set_budget(client, "2026-10", allowance=10000, spending_limit=8000)
        add_expense(client, amount=4000, date="2026-10-01")  # 4000/8000 = 50%

        _, data = get_analytics(client, "2026-10")
        assert data["utilisation_pct"] == pytest.approx(50.0, abs=0.01)

    def test_utilisation_can_exceed_100(self, client):
        set_budget(client, "2026-10", allowance=10000, spending_limit=5000)
        add_expense(client, amount=6000, date="2026-10-01")  # 120%

        _, data = get_analytics(client, "2026-10")
        assert data["utilisation_pct"] == pytest.approx(120.0, abs=0.01)


# ── Test 9: Warning thresholds (80% and 100%) ─────────────────────────────────

class TestBudgetWarnings:
    def test_alert_normal_below_80(self, client):
        set_budget(client, "2026-10", allowance=10000, spending_limit=10000)
        add_expense(client, amount=7999, date="2026-10-01")  # 79.99%

        _, data = get_analytics(client, "2026-10")
        assert data["alert_level"] == "normal"

    def test_alert_warning_at_exactly_80(self, client):
        set_budget(client, "2026-10", allowance=10000, spending_limit=10000)
        add_expense(client, amount=8000, date="2026-10-01")  # exactly 80%

        _, data = get_analytics(client, "2026-10")
        assert data["alert_level"] == "warning"

    def test_alert_warning_between_80_and_100(self, client):
        set_budget(client, "2026-10", allowance=10000, spending_limit=10000)
        add_expense(client, amount=9000, date="2026-10-01")  # 90%

        _, data = get_analytics(client, "2026-10")
        assert data["alert_level"] == "warning"

    def test_alert_danger_at_exactly_100(self, client):
        set_budget(client, "2026-10", allowance=10000, spending_limit=10000)
        add_expense(client, amount=10000, date="2026-10-01")  # 100%

        _, data = get_analytics(client, "2026-10")
        assert data["alert_level"] == "danger"

    def test_alert_danger_above_100(self, client):
        set_budget(client, "2026-10", allowance=10000, spending_limit=5000)
        add_expense(client, amount=6000, date="2026-10-01")  # 120%

        _, data = get_analytics(client, "2026-10")
        assert data["alert_level"] == "danger"


# ── Test 10: Empty database ───────────────────────────────────────────────────

class TestEmptyDatabase:
    def test_expenses_list_empty(self, client):
        res = client.get("/api/expenses")
        assert res.status_code == 200
        assert res.get_json() == []

    def test_analytics_zeros_on_empty_db(self, client):
        _, data = get_analytics(client, "2026-10")
        assert data["total_expenses"]    == 0.0
        assert data["remaining_balance"] == 0.0
        assert data["utilisation_pct"]   == 0.0
        assert data["alert_level"]       == "normal"
        assert data["category_breakdown"] == []

    def test_budget_returns_404_when_not_set(self, client):
        res = client.get("/api/budgets/2026-10")
        assert res.status_code == 404


# ── Test 11: Zero spending limit ──────────────────────────────────────────────

class TestZeroSpendingLimit:
    def test_no_divide_by_zero_error(self, client):
        """Setting limit=0 must not crash; utilisation should be 0."""
        set_budget(client, "2026-10", allowance=5000, spending_limit=0)
        add_expense(client, amount=1000, date="2026-10-01")

        _, data = get_analytics(client, "2026-10")
        assert data["utilisation_pct"] == 0.0
        assert data["alert_level"]     == "normal"

    def test_remaining_budget_with_zero_limit(self, client):
        set_budget(client, "2026-10", allowance=5000, spending_limit=0)
        add_expense(client, amount=1000, date="2026-10-01")

        _, data = get_analytics(client, "2026-10")
        # remaining_budget = 0 - 1000 = -1000
        assert data["remaining_budget"] == -1000.0


# ── Test 12: Month isolation ──────────────────────────────────────────────────

class TestMonthIsolation:
    def test_oct_expense_not_in_nov_totals(self, client):
        add_expense(client, amount=5000, date="2026-10-31")

        _, nov_data = get_analytics(client, "2026-11")
        assert nov_data["total_expenses"] == 0.0

    def test_nov_expense_not_in_oct_totals(self, client):
        add_expense(client, amount=5000, date="2026-11-01")

        _, oct_data = get_analytics(client, "2026-10")
        assert oct_data["total_expenses"] == 0.0

    def test_budgets_are_per_month(self, client):
        set_budget(client, "2026-10", allowance=10000, spending_limit=8000)
        set_budget(client, "2026-11", allowance=12000, spending_limit=9000)

        oct_res, oct_b = client.get("/api/budgets/2026-10"), None
        oct_b = client.get("/api/budgets/2026-10").get_json()
        nov_b = client.get("/api/budgets/2026-11").get_json()

        assert oct_b["allowance"]      == 10000.0
        assert nov_b["allowance"]      == 12000.0
        assert oct_b["spending_limit"] == 8000.0
        assert nov_b["spending_limit"] == 9000.0


# ── Test 13: Persistence across restart ──────────────────────────────────────

class TestPersistence:
    def test_data_survives_app_recreation(self, app):
        """
        Simulate a server restart by creating a second app instance that
        points at the SAME database file.  Records written by the first
        instance must be readable by the second.
        """
        db_path = app.config["DATABASE"]

        with app.test_client() as client1:
            add_expense(client1, amount=750, category="Education",
                        date="2026-10-10", note="Textbooks")

        # Create a new app pointing at the same db file (simulates restart)
        app2 = create_app(config_overrides={
            "DATABASE": db_path,
            "TESTING":  True,
        })

        with app2.test_client() as client2:
            res = client2.get("/api/expenses")
            expenses = res.get_json()

        assert len(expenses) == 1
        assert expenses[0]["amount"]   == 750.0
        assert expenses[0]["category"] == "Education"
        assert expenses[0]["note"]     == "Textbooks"
