"""
routes/budgets.py
-----------------
Blueprint for monthly budget management:

  GET  /api/budgets/<month>  – retrieve the budget for YYYY-MM
  POST /api/budgets          – create or update a budget for a month
"""

from flask import Blueprint, request, jsonify
from database.db import get_db
from datetime import datetime, timezone

budgets_bp = Blueprint("budgets", __name__)


def _validate_budget_payload(data):
    """
    Validate budget JSON payload.

    Returns (fields_dict, None) on success or (None, error_message) on failure.
    """
    errors = []

    # ── month ─────────────────────────────────────────────────────────────────
    month = data.get("month", "").strip()
    if not month:
        errors.append("'month' is required (YYYY-MM).")
    else:
        try:
            datetime.strptime(month, "%Y-%m")
        except ValueError:
            errors.append("'month' must be in YYYY-MM format.")

    # ── allowance ─────────────────────────────────────────────────────────────
    raw_allowance = data.get("allowance")
    if raw_allowance is None:
        errors.append("'allowance' is required.")
        allowance_paise = None
    else:
        try:
            allowance_float = float(raw_allowance)
            if allowance_float < 0:
                errors.append("'allowance' cannot be negative.")
            allowance_paise = round(allowance_float * 100)
        except (ValueError, TypeError):
            errors.append("'allowance' must be a valid number.")
            allowance_paise = None

    # ── spending_limit ────────────────────────────────────────────────────────
    raw_limit = data.get("spending_limit")
    if raw_limit is None:
        errors.append("'spending_limit' is required.")
        spending_limit_paise = None
    else:
        try:
            limit_float = float(raw_limit)
            if limit_float < 0:
                errors.append("'spending_limit' cannot be negative.")
            spending_limit_paise = round(limit_float * 100)
        except (ValueError, TypeError):
            errors.append("'spending_limit' must be a valid number.")
            spending_limit_paise = None

    if errors:
        return None, "; ".join(errors)

    return {
        "month":                month,
        "allowance_paise":      allowance_paise,
        "spending_limit_paise": spending_limit_paise,
    }, None


@budgets_bp.route("/api/budgets/<month>", methods=["GET"])
def get_budget(month):
    """
    Return the budget record for the given month (YYYY-MM).
    Returns 404 with a helpful message if no record exists yet.
    """
    try:
        datetime.strptime(month, "%Y-%m")
    except ValueError:
        return jsonify({"error": "Month must be in YYYY-MM format."}), 400

    db  = get_db()
    row = db.execute(
        "SELECT * FROM monthly_budgets WHERE month = ?", (month,)
    ).fetchone()

    if row is None:
        return jsonify({"error": f"No budget found for {month}."}), 404

    result = dict(row)
    result["allowance"]      = result["allowance_paise"]      / 100
    result["spending_limit"] = result["spending_limit_paise"] / 100
    return jsonify(result), 200


@budgets_bp.route("/api/budgets", methods=["POST"])
def upsert_budget():
    """
    Create a new budget record or update the existing one for the given month.

    Uses SQLite's INSERT OR REPLACE so the caller does not need to know
    whether a record already exists.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    fields, err = _validate_budget_payload(data)
    if err:
        return jsonify({"error": err}), 422

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    db  = get_db()

    existing = db.execute(
        "SELECT id, created_at FROM monthly_budgets WHERE month = ?",
        (fields["month"],),
    ).fetchone()

    if existing:
        db.execute(
            """
            UPDATE monthly_budgets
            SET allowance_paise = ?, spending_limit_paise = ?, updated_at = ?
            WHERE month = ?
            """,
            (fields["allowance_paise"], fields["spending_limit_paise"],
             now, fields["month"]),
        )
    else:
        db.execute(
            """
            INSERT INTO monthly_budgets
                (month, allowance_paise, spending_limit_paise, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (fields["month"], fields["allowance_paise"],
             fields["spending_limit_paise"], now, now),
        )

    db.commit()

    row = db.execute(
        "SELECT * FROM monthly_budgets WHERE month = ?", (fields["month"],)
    ).fetchone()

    result = dict(row)
    result["allowance"]      = result["allowance_paise"]      / 100
    result["spending_limit"] = result["spending_limit_paise"] / 100
    return jsonify(result), 200
