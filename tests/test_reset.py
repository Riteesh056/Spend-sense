"""
tests/test_reset.py
───────────────────
Automated tests for the monthly reset functionality:
  • DELETE /api/budgets/<month>
  • DELETE /api/expenses/month/<month>
  • POST   /api/reset-month (all | budget | expenses)
  • Month isolation during reset (other months unaffected)
"""

import os
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


def test_delete_budget_endpoint(client):
    """Test DELETE /api/budgets/<month> removes budget record."""
    # Set budget
    client.post("/api/budgets", json={"month": "2026-10", "allowance": 10000, "spending_limit": 8000})
    res = client.get("/api/budgets/2026-10")
    assert res.status_code == 200

    # Delete budget
    del_res = client.delete("/api/budgets/2026-10")
    assert del_res.status_code == 200
    data = del_res.get_json()
    assert data["success"] is True
    assert data["deleted"] is True

    # Now GET should 404
    assert client.get("/api/budgets/2026-10").status_code == 404

    # Idempotent delete on non-existent budget returns 200 with deleted=False
    del_again = client.delete("/api/budgets/2026-10")
    assert del_again.status_code == 200
    assert del_again.get_json()["deleted"] is False


def test_delete_budget_bad_month_rejected(client):
    res = client.delete("/api/budgets/invalid-month")
    assert res.status_code == 400


def test_delete_expenses_for_month(client):
    """Test DELETE /api/expenses/month/<month> only removes that month's expenses."""
    # Add expenses for Oct and Nov
    client.post("/api/expenses", json={"amount": 500, "category": "Food", "expense_date": "2026-10-15"})
    client.post("/api/expenses", json={"amount": 300, "category": "Transport", "expense_date": "2026-10-20"})
    client.post("/api/expenses", json={"amount": 700, "category": "Education", "expense_date": "2026-11-05"})

    # Delete Oct expenses
    del_res = client.delete("/api/expenses/month/2026-10")
    assert del_res.status_code == 200
    assert del_res.get_json()["deleted_count"] == 2

    # Check Oct list is empty
    oct_list = client.get("/api/expenses?month=2026-10").get_json()
    assert len(oct_list) == 0

    # Check Nov list still has 1 item
    nov_list = client.get("/api/expenses?month=2026-11").get_json()
    assert len(nov_list) == 1
    assert nov_list[0]["amount"] == 700.0


def test_delete_expenses_bad_month_rejected(client):
    res = client.delete("/api/expenses/month/bad-month")
    assert res.status_code == 400


def test_reset_month_budget_only(client):
    """Test POST /api/reset-month with reset_type='budget'."""
    client.post("/api/budgets", json={"month": "2026-10", "allowance": 8000, "spending_limit": 6000})
    client.post("/api/expenses", json={"amount": 400, "category": "Food", "expense_date": "2026-10-12"})

    res = client.post("/api/reset-month", json={"month": "2026-10", "reset_type": "budget"})
    assert res.status_code == 200
    data = res.get_json()
    assert data["budget_deleted"] is True
    assert data["expenses_deleted"] == 0

    # Budget should be gone
    assert client.get("/api/budgets/2026-10").status_code == 404
    # Expense should still exist
    assert len(client.get("/api/expenses?month=2026-10").get_json()) == 1


def test_reset_month_expenses_only(client):
    """Test POST /api/reset-month with reset_type='expenses'."""
    client.post("/api/budgets", json={"month": "2026-10", "allowance": 8000, "spending_limit": 6000})
    client.post("/api/expenses", json={"amount": 400, "category": "Food", "expense_date": "2026-10-12"})

    res = client.post("/api/reset-month", json={"month": "2026-10", "reset_type": "expenses"})
    assert res.status_code == 200
    data = res.get_json()
    assert data["budget_deleted"] is False
    assert data["expenses_deleted"] == 1

    # Budget should still exist
    assert client.get("/api/budgets/2026-10").status_code == 200
    # Expense should be gone
    assert len(client.get("/api/expenses?month=2026-10").get_json()) == 0


def test_reset_month_all(client):
    """Test POST /api/reset-month with reset_type='all'."""
    # Month 1: 2026-10
    client.post("/api/budgets", json={"month": "2026-10", "allowance": 8000, "spending_limit": 6000})
    client.post("/api/expenses", json={"amount": 400, "category": "Food", "expense_date": "2026-10-12"})

    # Month 2: 2026-11
    client.post("/api/budgets", json={"month": "2026-11", "allowance": 12000, "spending_limit": 9000})
    client.post("/api/expenses", json={"amount": 950, "category": "Shopping", "expense_date": "2026-11-02"})

    # Reset 2026-10 completely
    res = client.post("/api/reset-month", json={"month": "2026-10", "reset_type": "all"})
    assert res.status_code == 200
    data = res.get_json()
    assert data["budget_deleted"] is True
    assert data["expenses_deleted"] == 1

    # Oct budget & expenses wiped
    assert client.get("/api/budgets/2026-10").status_code == 404
    assert len(client.get("/api/expenses?month=2026-10").get_json()) == 0

    # Nov budget & expenses remain untouched
    nov_b = client.get("/api/budgets/2026-11").get_json()
    assert nov_b["allowance"] == 12000.0
    nov_e = client.get("/api/expenses?month=2026-11").get_json()
    assert len(nov_e) == 1
    assert nov_e[0]["amount"] == 950.0


def test_reset_month_validation(client):
    """Test validation errors on POST /api/reset-month."""
    # Missing month
    res = client.post("/api/reset-month", json={"reset_type": "all"})
    assert res.status_code == 400

    # Bad month format
    res = client.post("/api/reset-month", json={"month": "2026-13", "reset_type": "all"})
    assert res.status_code == 400

    # Invalid reset_type
    res = client.post("/api/reset-month", json={"month": "2026-10", "reset_type": "everything"})
    assert res.status_code == 400
