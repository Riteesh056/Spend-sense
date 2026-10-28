"""
routes/expenses.py
------------------
Blueprint that handles all expense-related routes:

  GET    /api/expenses          – list expenses (filterable by month & category)
  POST   /api/expenses          – create a new expense
  PUT    /api/expenses/<id>     – update an existing expense
  DELETE /api/expenses/<id>     – delete an expense
"""

from flask import Blueprint, request, jsonify, current_app
from database.db import get_db
from datetime import datetime, timezone

expenses_bp = Blueprint("expenses", __name__)

# ── helpers ───────────────────────────────────────────────────────────────────

def _row_to_dict(row):
    """Convert a sqlite3.Row to a plain dict and convert paise → rupees."""
    d = dict(row)
    d["amount"] = d["amount_paise"] / 100   # display value in rupees
    return d


def _validate_expense_payload(data):
    """
    Validate and extract fields from a request JSON payload.

    Returns (fields_dict, None) on success or (None, error_message) on failure.
    """
    errors = []

    # ── amount ────────────────────────────────────────────────────────────────
    raw_amount = data.get("amount")
    if raw_amount is None:
        errors.append("'amount' is required.")
    else:
        try:
            amount_float = float(raw_amount)
            if amount_float <= 0:
                errors.append("'amount' must be greater than zero.")
            # Convert to integer paise, rounding to the nearest paisa.
            amount_paise = round(amount_float * 100)
            if amount_paise <= 0:
                errors.append("'amount' must be at least ₹0.01 (1 paisa).")
        except (ValueError, TypeError):
            errors.append("'amount' must be a valid number.")
            amount_paise = None

    # ── category ──────────────────────────────────────────────────────────────
    category = data.get("category", "").strip()
    valid_categories = current_app.config["EXPENSE_CATEGORIES"]
    if not category:
        errors.append("'category' is required.")
    elif category not in valid_categories:
        errors.append(f"'category' must be one of: {', '.join(valid_categories)}.")

    # ── expense_date ──────────────────────────────────────────────────────────
    expense_date = data.get("expense_date", "").strip()
    if not expense_date:
        errors.append("'expense_date' is required.")
    else:
        try:
            datetime.strptime(expense_date, "%Y-%m-%d")
        except ValueError:
            errors.append("'expense_date' must be in YYYY-MM-DD format.")

    # ── optional note ─────────────────────────────────────────────────────────
    note = data.get("note", "").strip() or None

    if errors:
        return None, "; ".join(errors)

    return {
        "amount_paise": amount_paise,
        "category":     category,
        "expense_date": expense_date,
        "note":         note,
    }, None


# ── routes ────────────────────────────────────────────────────────────────────

@expenses_bp.route("/api/expenses", methods=["GET"])
def list_expenses():
    """
    Return a JSON list of expenses.

    Optional query parameters:
      month    – YYYY-MM  (filter to expenses whose date starts with this value)
      category – exact category string
    """
    db = get_db()
    month    = request.args.get("month", "").strip()
    category = request.args.get("category", "").strip()

    query  = "SELECT * FROM expenses WHERE 1=1"
    params = []

    if month:
        query  += " AND expense_date LIKE ?"
        params.append(f"{month}-%")

    if category:
        query  += " AND category = ?"
        params.append(category)

    query += " ORDER BY expense_date DESC, created_at DESC"

    rows = db.execute(query, params).fetchall()
    return jsonify([_row_to_dict(r) for r in rows]), 200


@expenses_bp.route("/api/expenses", methods=["POST"])
def create_expense():
    """Create a new expense record."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    fields, err = _validate_expense_payload(data)
    if err:
        return jsonify({"error": err}), 422

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    db  = get_db()

    cursor = db.execute(
        """
        INSERT INTO expenses (amount_paise, category, note, expense_date, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (fields["amount_paise"], fields["category"],
         fields["note"], fields["expense_date"], now),
    )
    db.commit()

    row = db.execute("SELECT * FROM expenses WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(_row_to_dict(row)), 201


@expenses_bp.route("/api/expenses/<int:expense_id>", methods=["PUT"])
def update_expense(expense_id):
    """Update an existing expense."""
    db  = get_db()
    row = db.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    if row is None:
        return jsonify({"error": f"Expense {expense_id} not found."}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    fields, err = _validate_expense_payload(data)
    if err:
        return jsonify({"error": err}), 422

    db.execute(
        """
        UPDATE expenses
        SET amount_paise = ?, category = ?, note = ?, expense_date = ?
        WHERE id = ?
        """,
        (fields["amount_paise"], fields["category"],
         fields["note"], fields["expense_date"], expense_id),
    )
    db.commit()

    updated = db.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    return jsonify(_row_to_dict(updated)), 200


@expenses_bp.route("/api/expenses/<int:expense_id>", methods=["DELETE"])
def delete_expense(expense_id):
    """Delete an expense by ID."""
    db  = get_db()
    row = db.execute("SELECT id FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    if row is None:
        return jsonify({"error": f"Expense {expense_id} not found."}), 404

    db.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    db.commit()
    return jsonify({"message": f"Expense {expense_id} deleted."}), 200


@expenses_bp.route("/api/expenses/month/<month>", methods=["DELETE"])
def delete_expenses_for_month(month):
    """Delete all expenses for the given month (YYYY-MM)."""
    try:
        datetime.strptime(month, "%Y-%m")
    except ValueError:
        return jsonify({"error": "Month must be in YYYY-MM format."}), 400

    db = get_db()
    cursor = db.execute("DELETE FROM expenses WHERE expense_date LIKE ?", (f"{month}-%",))
    db.commit()

    return jsonify({
        "success": True,
        "message": f"All expenses for {month} have been deleted.",
        "month": month,
        "deleted_count": cursor.rowcount,
    }), 200
