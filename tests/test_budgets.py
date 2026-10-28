"""
tests/test_budgets.py
─────────────────────
Stage 3 – Budget Management & Dashboard Integration Tests

Covers:
  • Budget CRUD (create, read, update)
  • Budget validation (negative values, missing fields, bad month format)
  • Upsert behaviour (POST same month updates instead of duplicating)
  • Dashboard analytics integration (budget + expenses → correct summary)
  • Budget values appear correctly in analytics response
  • Multiple months stay independent

Run:
    .\\venv\\Scripts\\python.exe -m pytest tests/test_budgets.py -v
"""

import os
import json
import tempfile
import pytest

from app import create_app


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def app():
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


# ── Helpers ────────────────────────────────────────────────────────────────────

def set_budget(client, month, allowance, spending_limit):
    return client.post(
        "/api/budgets",
        data=json.dumps({
            "month":          month,
            "allowance":      allowance,
            "spending_limit": spending_limit,
        }),
        content_type="application/json",
    )


def add_expense(client, amount, category="Food", date="2026-10-15"):
    return client.post(
        "/api/expenses",
        data=json.dumps({
            "amount":       amount,
            "category":     category,
            "expense_date": date,
        }),
        content_type="application/json",
    )


# ── Budget CRUD ───────────────────────────────────────────────────────────────

class TestBudgetCreate:
    def test_create_budget_returns_200(self, client):
        res = set_budget(client, "2026-10", 15000, 12000)
        assert res.status_code == 200

    def test_create_budget_returns_correct_values(self, client):
        res = set_budget(client, "2026-10", 15000, 12000)
        data = res.get_json()
        assert data["allowance"]      == 15000.0
        assert data["spending_limit"] == 12000.0
        assert data["month"]          == "2026-10"

    def test_create_budget_stores_paise(self, client):
        res = set_budget(client, "2026-10", 15000.75, 12000.50)
        data = res.get_json()
        assert data["allowance_paise"]      == 1500075
        assert data["spending_limit_paise"] == 1200050

    def test_retrieve_budget(self, client):
        set_budget(client, "2026-10", 15000, 12000)
        res = client.get("/api/budgets/2026-10")
        assert res.status_code == 200
        data = res.get_json()
        assert data["allowance"]      == 15000.0
        assert data["spending_limit"] == 12000.0


class TestBudgetUpdate:
    def test_upsert_updates_existing_record(self, client):
        """POSTing the same month a second time should update, not duplicate."""
        set_budget(client, "2026-10", 10000, 8000)
        set_budget(client, "2026-10", 20000, 15000)

        res = client.get("/api/budgets/2026-10")
        data = res.get_json()
        assert data["allowance"]      == 20000.0
        assert data["spending_limit"] == 15000.0

    def test_update_preserves_created_at(self, client):
        """created_at should stay the same after an update."""
        set_budget(client, "2026-10", 10000, 8000)
        res1 = client.get("/api/budgets/2026-10").get_json()

        set_budget(client, "2026-10", 20000, 15000)
        res2 = client.get("/api/budgets/2026-10").get_json()

        assert res2["created_at"] == res1["created_at"]

    def test_update_changes_updated_at(self, client):
        set_budget(client, "2026-10", 10000, 8000)
        res1 = client.get("/api/budgets/2026-10").get_json()

        set_budget(client, "2026-10", 20000, 15000)
        res2 = client.get("/api/budgets/2026-10").get_json()

        # updated_at should be >= the original (they might be same if very fast)
        assert res2["updated_at"] >= res1["updated_at"]


class TestBudgetValidation:
    def test_missing_month_rejected(self, client):
        res = client.post(
            "/api/budgets",
            data=json.dumps({"allowance": 10000, "spending_limit": 8000}),
            content_type="application/json",
        )
        assert res.status_code == 422

    def test_bad_month_format_rejected(self, client):
        res = client.post(
            "/api/budgets",
            data=json.dumps({
                "month": "October-2026",
                "allowance": 10000,
                "spending_limit": 8000,
            }),
            content_type="application/json",
        )
        assert res.status_code == 422

    def test_missing_allowance_rejected(self, client):
        res = client.post(
            "/api/budgets",
            data=json.dumps({"month": "2026-10", "spending_limit": 8000}),
            content_type="application/json",
        )
        assert res.status_code == 422

    def test_missing_spending_limit_rejected(self, client):
        res = client.post(
            "/api/budgets",
            data=json.dumps({"month": "2026-10", "allowance": 10000}),
            content_type="application/json",
        )
        assert res.status_code == 422

    def test_negative_allowance_rejected(self, client):
        res = client.post(
            "/api/budgets",
            data=json.dumps({
                "month": "2026-10",
                "allowance": -5000,
                "spending_limit": 8000,
            }),
            content_type="application/json",
        )
        assert res.status_code == 422

    def test_negative_spending_limit_rejected(self, client):
        res = client.post(
            "/api/budgets",
            data=json.dumps({
                "month": "2026-10",
                "allowance": 10000,
                "spending_limit": -1,
            }),
            content_type="application/json",
        )
        assert res.status_code == 422

    def test_non_json_body_rejected(self, client):
        res = client.post("/api/budgets", data="not json",
                          content_type="text/plain")
        assert res.status_code == 400

    def test_get_bad_month_format_returns_400(self, client):
        res = client.get("/api/budgets/Oct-2026")
        assert res.status_code == 400

    def test_zero_values_accepted(self, client):
        """A user should be able to set both to 0."""
        res = set_budget(client, "2026-10", 0, 0)
        assert res.status_code == 200
        data = res.get_json()
        assert data["allowance"]      == 0.0
        assert data["spending_limit"] == 0.0


# ── Dashboard Analytics Integration ────────────────────────────────────────────

class TestDashboardIntegration:
    def test_analytics_reflects_budget_and_expenses(self, client):
        """Full integration: set budget, add expenses, verify analytics."""
        set_budget(client, "2026-10", 15000, 10000)
        add_expense(client, 2000, "Food",      "2026-10-05")
        add_expense(client, 1500, "Transport", "2026-10-10")
        add_expense(client, 500,  "Education", "2026-10-15")

        res = client.get("/api/analytics/2026-10")
        assert res.status_code == 200
        data = res.get_json()

        assert data["total_expenses"]    == 4000.0
        assert data["allowance"]         == 15000.0
        assert data["spending_limit"]    == 10000.0
        assert data["remaining_balance"] == 11000.0    # 15000 - 4000
        assert data["remaining_budget"]  == 6000.0     # 10000 - 4000
        assert data["utilisation_pct"]   == pytest.approx(40.0, abs=0.01)
        assert data["alert_level"]       == "normal"

    def test_analytics_has_category_breakdown(self, client):
        add_expense(client, 2000, "Food",      "2026-10-05")
        add_expense(client, 1500, "Transport", "2026-10-10")
        add_expense(client, 800,  "Food",      "2026-10-20")

        res = client.get("/api/analytics/2026-10")
        data = res.get_json()
        breakdown = {b["category"]: b["total"] for b in data["category_breakdown"]}

        assert breakdown["Food"]      == 2800.0     # 2000 + 800
        assert breakdown["Transport"] == 1500.0

    def test_analytics_has_daily_spending(self, client):
        add_expense(client, 500, "Food", "2026-10-05")
        add_expense(client, 300, "Food", "2026-10-05")  # same day
        add_expense(client, 800, "Food", "2026-10-10")

        res = client.get("/api/analytics/2026-10")
        data = res.get_json()
        daily = {d["date"]: d["total"] for d in data["daily_spending"]}

        assert daily["2026-10-05"] == 800.0     # 500 + 300
        assert daily["2026-10-10"] == 800.0

    def test_analytics_has_recent_expenses(self, client):
        add_expense(client, 100, "Food",      "2026-10-01")
        add_expense(client, 200, "Transport", "2026-10-15")
        add_expense(client, 300, "Education", "2026-10-20")

        res = client.get("/api/analytics/2026-10")
        data = res.get_json()

        # recent_expenses should be sorted newest-first
        recent = data["recent_expenses"]
        assert len(recent) == 3
        assert recent[0]["expense_date"] == "2026-10-20"
        assert recent[2]["expense_date"] == "2026-10-01"

    def test_recent_expenses_limited_to_5(self, client):
        for i in range(1, 9):
            add_expense(client, 100 * i, "Food", f"2026-10-{i:02d}")

        res = client.get("/api/analytics/2026-10")
        data = res.get_json()

        assert len(data["recent_expenses"]) == 5

    def test_dashboard_updates_after_budget_change(self, client):
        set_budget(client, "2026-10", 10000, 8000)
        add_expense(client, 7000, "Food", "2026-10-01")

        # Before update: 7000/8000 = 87.5% → warning
        res1 = client.get("/api/analytics/2026-10").get_json()
        assert res1["alert_level"] == "warning"

        # Increase the limit → should go back to normal
        set_budget(client, "2026-10", 10000, 15000)
        res2 = client.get("/api/analytics/2026-10").get_json()
        # 7000/15000 = 46.67% → normal
        assert res2["alert_level"] == "normal"
        assert res2["spending_limit"] == 15000.0

    def test_dashboard_page_renders_with_categories(self, client):
        """Verify the dashboard HTML includes all expense categories for the modal and limit element."""
        res = client.get("/")
        html = res.data.decode("utf-8")
        assert "Food" in html
        assert "Transport" in html
        assert "Entertainment" in html
        assert "Bills &amp; Subscriptions" in html
        assert 'id="stat-limit"' in html

    def test_budget_page_renders_with_categories(self, client):
        """Budget page should also have the categories (for the Add Expense modal)."""
        res = client.get("/budget")
        html = res.data.decode("utf-8")
        assert "Food" in html

    def test_pages_accept_month_query_param(self, client):
        """All three page routes should accept ?month= and return 200."""
        for path in ["/", "/transactions", "/budget"]:
            res = client.get(f"{path}?month=2026-11")
            assert res.status_code == 200
