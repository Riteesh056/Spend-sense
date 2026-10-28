"""
services/analytics.py
---------------------
Pure calculation functions for dashboard and analytics data.

All functions take a `db` connection and a `month` string (YYYY-MM) and
return plain Python dicts so the route handlers can serialise them as JSON.

Keeping calculations here (separate from route handlers) makes them easy
to unit-test without spinning up a real HTTP server.
"""

from config import BUDGET_WARNING_THRESHOLD, BUDGET_DANGER_THRESHOLD


def get_monthly_summary(db, month):
    """
    Calculate the full dashboard summary for a given month.

    Returns a dict with:
      total_expenses       – rupees, float
      allowance            – rupees, float (0 if no budget set)
      spending_limit       – rupees, float (0 if no budget set)
      remaining_balance    – allowance − total_expenses
      remaining_budget     – spending_limit − total_expenses
      utilisation_pct      – (total_expenses / spending_limit) × 100, or 0
      alert_level          – "normal" | "warning" | "danger"
      category_breakdown   – list of {category, total} sorted descending
    """
    # ── Total expenses for the month ──────────────────────────────────────────
    row = db.execute(
        """
        SELECT COALESCE(SUM(amount_paise), 0) AS total
        FROM expenses
        WHERE expense_date LIKE ?
        """,
        (f"{month}-%",),
    ).fetchone()
    total_paise = row["total"]

    # ── Budget record ─────────────────────────────────────────────────────────
    budget = db.execute(
        "SELECT allowance_paise, spending_limit_paise FROM monthly_budgets WHERE month = ?",
        (month,),
    ).fetchone()

    allowance_paise      = budget["allowance_paise"]      if budget else 0
    spending_limit_paise = budget["spending_limit_paise"] if budget else 0

    # ── Derived values ────────────────────────────────────────────────────────
    remaining_balance_paise = allowance_paise - total_paise
    remaining_budget_paise  = spending_limit_paise - total_paise

    # Budget utilisation – guard against divide-by-zero when limit is 0.
    if spending_limit_paise > 0:
        utilisation_pct = (total_paise / spending_limit_paise) * 100
    else:
        utilisation_pct = 0.0

    # Alert level
    if utilisation_pct >= BUDGET_DANGER_THRESHOLD:
        alert_level = "danger"
    elif utilisation_pct >= BUDGET_WARNING_THRESHOLD:
        alert_level = "warning"
    else:
        alert_level = "normal"

    # ── Category breakdown ────────────────────────────────────────────────────
    cat_rows = db.execute(
        """
        SELECT category, SUM(amount_paise) AS total
        FROM expenses
        WHERE expense_date LIKE ?
        GROUP BY category
        ORDER BY total DESC
        """,
        (f"{month}-%",),
    ).fetchall()

    category_breakdown = [
        {"category": r["category"], "total": r["total"] / 100}
        for r in cat_rows
    ]

    return {
        "month":               month,
        "has_budget":          budget is not None,
        "total_expenses":      total_paise / 100,
        "allowance":           allowance_paise / 100,
        "spending_limit":      spending_limit_paise / 100,
        "remaining_balance":   remaining_balance_paise / 100,
        "remaining_budget":    remaining_budget_paise / 100,
        "utilisation_pct":     round(utilisation_pct, 2),
        "alert_level":         alert_level,
        "category_breakdown":  category_breakdown,
    }


def get_daily_spending(db, month):
    """
    Return daily totals for all days in `month` that have expenses.

    Returns a list of {date: "YYYY-MM-DD", total: float (rupees)} sorted by date.
    Used by the bar chart on the dashboard.
    """
    rows = db.execute(
        """
        SELECT expense_date AS date, SUM(amount_paise) AS total
        FROM expenses
        WHERE expense_date LIKE ?
        GROUP BY expense_date
        ORDER BY expense_date
        """,
        (f"{month}-%",),
    ).fetchall()

    return [{"date": r["date"], "total": r["total"] / 100} for r in rows]


def get_recent_expenses(db, month, limit=5):
    """
    Return the most recent `limit` expenses for `month`.

    Used by the dashboard's "Recent Transactions" widget.
    """
    rows = db.execute(
        """
        SELECT * FROM expenses
        WHERE expense_date LIKE ?
        ORDER BY expense_date DESC, created_at DESC
        LIMIT ?
        """,
        (f"{month}-%", limit),
    ).fetchall()

    result = []
    for r in rows:
        d = dict(r)
        d["amount"] = d["amount_paise"] / 100
        result.append(d)
    return result
