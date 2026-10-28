"""
tests/test_stage1.py
---------------------
Stage 1 smoke tests: verify the Flask app starts, tables are created,
and the three page routes return HTTP 200.

Run with:
    .\\venv\\Scripts\\python.exe -m pytest tests/test_stage1.py -v
"""

import os
import tempfile
import pytest

# Import the app factory
from app import create_app


@pytest.fixture
def app():
    """
    Create an application instance that uses a temporary SQLite file.
    The temp file is deleted after the test session ends.
    """
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(db_fd)          # close the OS file descriptor; SQLite will reopen it

    application = create_app(config_overrides={"DATABASE": db_path, "TESTING": True})
    yield application

    # Teardown – remove the temp database
    try:
        os.unlink(db_path)
    except OSError:
        pass


@pytest.fixture
def client(app):
    """A test client for the app."""
    return app.test_client()


# ── Page route tests ──────────────────────────────────────────────────────────

def test_dashboard_returns_200(client):
    res = client.get("/")
    assert res.status_code == 200, f"Dashboard returned {res.status_code}"


def test_transactions_returns_200(client):
    res = client.get("/transactions")
    assert res.status_code == 200, f"Transactions returned {res.status_code}"


def test_budget_page_returns_200(client):
    res = client.get("/budget")
    assert res.status_code == 200, f"Budget page returned {res.status_code}"


# ── API smoke tests ───────────────────────────────────────────────────────────

def test_analytics_returns_200_on_empty_db(client):
    res = client.get("/api/analytics/2026-10")
    assert res.status_code == 200
    data = res.get_json()
    assert data["total_expenses"] == 0.0
    assert data["alert_level"] == "normal"


def test_analytics_rejects_bad_month_format(client):
    res = client.get("/api/analytics/October-2026")
    assert res.status_code == 400


def test_expenses_list_empty_on_fresh_db(client):
    res = client.get("/api/expenses")
    assert res.status_code == 200
    assert res.get_json() == []


def test_budget_404_when_none_set(client):
    res = client.get("/api/budgets/2026-10")
    assert res.status_code == 404


def test_404_handler_returns_json(client):
    res = client.get("/does-not-exist")
    assert res.status_code == 404
    assert "error" in res.get_json()
