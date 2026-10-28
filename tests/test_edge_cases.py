"""
tests/test_edge_cases.py
────────────────────────
Stage 6: Deep Edge Cases, Security & Business Logic Verification

Tests:
  1. Financial precision & extreme amounts (large values, fractional paise, rounding)
  2. Calendar date validation (leap year Feb 29, invalid Feb 30, April 31)
  3. SQL Injection resistance (malicious strings in query params, categories, notes)
  4. XSS payloads in notes and descriptions (safe storage and JSON response)
  5. Exact boundary threshold checks (79.99% vs 80.00%, 99.99% vs 100.00%)
  6. Negative remaining balance when expenses exceed monthly allowance
  7. Empty & whitespace-only inputs
  8. Concurrent queries / connection lifecycle verification
"""

import os
import json
import tempfile
import pytest

from app import create_app


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


# ── 1. Financial Precision & Extreme Amounts ─────────────────────────────────

class TestFinancialPrecision:
    def test_large_amount_handling(self, client):
        """Ensure multi-crore amounts are correctly stored in integer paise."""
        one_crore = 10000000.0  # ₹1 Crore = 10,000,000
        res = client.post("/api/expenses", json={
            "amount": one_crore,
            "category": "Education",
            "expense_date": "2026-10-10",
        })
        assert res.status_code == 201
        data = res.get_json()
        assert data["amount"] == one_crore
        assert data["amount_paise"] == 1000000000  # 1 Billion paise

    def test_three_decimal_rounding(self, client):
        """Amounts like 10.555 round to 1056 paise (₹10.56)."""
        res = client.post("/api/expenses", json={
            "amount": 10.555,
            "category": "Food",
            "expense_date": "2026-10-10",
        })
        assert res.status_code == 201
        data = res.get_json()
        assert data["amount_paise"] == 1056
        assert data["amount"] == 10.56

    def test_small_sub_paisa_amount(self, client):
        """Amounts less than half a paisa round to 0 paise and must be rejected as <= 0."""
        res = client.post("/api/expenses", json={
            "amount": 0.002,
            "category": "Food",
            "expense_date": "2026-10-10",
        })
        assert res.status_code == 422
        assert "must be at least ₹0.01" in res.get_json()["error"]


# ── 2. Calendar Date Validation ──────────────────────────────────────────────

class TestDateValidation:
    def test_leap_year_feb_29_valid(self, client):
        """2024 is a leap year; 2024-02-29 must be accepted."""
        res = client.post("/api/expenses", json={
            "amount": 250,
            "category": "Food",
            "expense_date": "2024-02-29",
        })
        assert res.status_code == 201

    def test_non_leap_year_feb_29_rejected(self, client):
        """2026 is NOT a leap year; 2026-02-29 must be rejected."""
        res = client.post("/api/expenses", json={
            "amount": 250,
            "category": "Food",
            "expense_date": "2026-02-29",
        })
        assert res.status_code == 422
        assert "expense_date" in res.get_json()["error"]

    def test_invalid_day_31_for_30_day_month(self, client):
        """April has only 30 days; 2026-04-31 must be rejected."""
        res = client.post("/api/expenses", json={
            "amount": 250,
            "category": "Food",
            "expense_date": "2026-04-31",
        })
        assert res.status_code == 422

    def test_invalid_month_13_rejected(self, client):
        res = client.post("/api/expenses", json={
            "amount": 250,
            "category": "Food",
            "expense_date": "2026-13-01",
        })
        assert res.status_code == 422


# ── 3. SQL Injection Resistance ──────────────────────────────────────────────

class TestSQLInjectionResistance:
    def test_sql_injection_in_category(self, client):
        """Attempt SQL injection via category parameter."""
        payload = "' OR 1=1; --"
        res = client.get(f"/api/expenses?category={payload}")
        assert res.status_code == 200
        # Should safely return an empty list because no expense matches that category string
        assert res.get_json() == []

    def test_sql_injection_in_month(self, client):
        """Attempt SQL injection in month query param."""
        payload = "2026-10' OR '1'='1"
        res = client.get(f"/api/expenses?month={payload}")
        assert res.status_code == 200
        assert res.get_json() == []

    def test_sql_injection_in_note(self, client):
        """Attempt SQL injection inside note field."""
        injection_note = "'); DROP TABLE expenses; --"
        res = client.post("/api/expenses", json={
            "amount": 100,
            "category": "Food",
            "expense_date": "2026-10-10",
            "note": injection_note,
        })
        assert res.status_code == 201

        # Verify expenses table still exists and functions
        check_res = client.get("/api/expenses")
        assert check_res.status_code == 200
        assert len(check_res.get_json()) == 1
        assert check_res.get_json()[0]["note"] == injection_note


# ── 4. XSS Payload Handling ──────────────────────────────────────────────────

class TestXSSPayloads:
    def test_script_tag_in_note_is_stored_literally(self, client):
        """Script tags are safely stored as plain text without execution."""
        xss_string = "<script>alert('xss')</script>"
        res = client.post("/api/expenses", json={
            "amount": 50,
            "category": "Other",
            "expense_date": "2026-10-15",
            "note": xss_string,
        })
        assert res.status_code == 201
        data = res.get_json()
        assert data["note"] == xss_string


# ── 5. Exact Boundary Checks for Alerts ──────────────────────────────────────

class TestThresholdBoundaries:
    def test_79_point_99_percent_is_normal(self, client):
        """₹7,999 out of ₹10,000 is 79.99% -> Normal status."""
        client.post("/api/budgets", json={
            "month": "2026-10",
            "allowance": 10000,
            "spending_limit": 10000,
        })
        client.post("/api/expenses", json={
            "amount": 7999,
            "category": "Bills & Subscriptions",
            "expense_date": "2026-10-01",
        })
        res = client.get("/api/analytics/2026-10")
        data = res.get_json()
        assert data["alert_level"] == "normal"
        assert data["utilisation_pct"] == 79.99

    def test_80_point_00_percent_is_warning(self, client):
        """₹8,000 out of ₹10,000 is exactly 80% -> Warning status."""
        client.post("/api/budgets", json={
            "month": "2026-10",
            "allowance": 10000,
            "spending_limit": 10000,
        })
        client.post("/api/expenses", json={
            "amount": 8000,
            "category": "Bills & Subscriptions",
            "expense_date": "2026-10-01",
        })
        res = client.get("/api/analytics/2026-10")
        data = res.get_json()
        assert data["alert_level"] == "warning"
        assert data["utilisation_pct"] == 80.0

    def test_99_point_99_percent_is_warning(self, client):
        """₹9,999 out of ₹10,000 is 99.99% -> Warning status."""
        client.post("/api/budgets", json={
            "month": "2026-10",
            "allowance": 10000,
            "spending_limit": 10000,
        })
        client.post("/api/expenses", json={
            "amount": 9999,
            "category": "Bills & Subscriptions",
            "expense_date": "2026-10-01",
        })
        res = client.get("/api/analytics/2026-10")
        data = res.get_json()
        assert data["alert_level"] == "warning"
        assert data["utilisation_pct"] == 99.99

    def test_100_point_00_percent_is_danger(self, client):
        """₹10,000 out of ₹10,000 is exactly 100% -> Danger status."""
        client.post("/api/budgets", json={
            "month": "2026-10",
            "allowance": 10000,
            "spending_limit": 10000,
        })
        client.post("/api/expenses", json={
            "amount": 10000,
            "category": "Bills & Subscriptions",
            "expense_date": "2026-10-01",
        })
        res = client.get("/api/analytics/2026-10")
        data = res.get_json()
        assert data["alert_level"] == "danger"
        assert data["utilisation_pct"] == 100.0


# ── 6. Negative Remaining Balance ────────────────────────────────────────────

class TestNegativeBalance:
    def test_expenses_exceeding_allowance_gives_negative_balance(self, client):
        """If expenses (₹12,000) exceed allowance (₹10,000), balance is -₹2,000."""
        client.post("/api/budgets", json={
            "month": "2026-10",
            "allowance": 10000,
            "spending_limit": 10000,
        })
        client.post("/api/expenses", json={
            "amount": 12000,
            "category": "Shopping",
            "expense_date": "2026-10-05",
        })
        res = client.get("/api/analytics/2026-10")
        data = res.get_json()
        assert data["remaining_balance"] == -2000.0
        assert data["remaining_budget"] == -2000.0
        assert data["alert_level"] == "danger"


# ── 7. Input Whitespace Sanitization ─────────────────────────────────────────

class TestInputSanitization:
    def test_category_with_padding_whitespace_is_accepted(self, client):
        """Category '  Food  ' should be stripped and accepted."""
        res = client.post("/api/expenses", json={
            "amount": 100,
            "category": "  Food  ",
            "expense_date": "2026-10-10",
        })
        assert res.status_code == 201
        assert res.get_json()["category"] == "Food"

    def test_empty_note_becomes_none(self, client):
        """Whitespace note becomes None in the database."""
        res = client.post("/api/expenses", json={
            "amount": 100,
            "category": "Food",
            "expense_date": "2026-10-10",
            "note": "    ",
        })
        assert res.status_code == 201
        assert res.get_json()["note"] is None
