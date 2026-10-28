"""
app.py
------
Application factory and page routes for SpendSense.

The create_app() function creates and configures the Flask instance.
Calling it with a config_overrides dict (used in tests) lets tests inject
a different DATABASE path without touching config.py.

Page routes (returning rendered HTML) are registered directly here
because they are few and simple.  API routes live in their own blueprints
inside the routes/ package.
"""

import os
from datetime import datetime
from flask import Flask, render_template, jsonify, request

import config
from database.db import init_app as db_init_app, init_db, get_db
from routes.expenses import expenses_bp
from routes.budgets  import budgets_bp
from services.analytics import get_monthly_summary, get_daily_spending, get_recent_expenses


def create_app(config_overrides=None):
    """
    Create and return the Flask application.

    Parameters
    ----------
    config_overrides : dict, optional
        Key-value pairs that override values from config.py.
        Used by the test suite to point the app at a throwaway database.
    """
    app = Flask(__name__, instance_relative_config=False)

    # ── Load configuration ────────────────────────────────────────────────────
    app.config.update(
        SECRET_KEY          = config.SECRET_KEY,
        DEBUG               = config.DEBUG,
        DATABASE            = config.DATABASE_PATH,
        EXPENSE_CATEGORIES  = config.EXPENSE_CATEGORIES,
        BUDGET_WARNING_THRESHOLD = config.BUDGET_WARNING_THRESHOLD,
        BUDGET_DANGER_THRESHOLD  = config.BUDGET_DANGER_THRESHOLD,
    )

    if config_overrides:
        app.config.update(config_overrides)

    # Ensure the data directory exists (needed before first DB access).
    os.makedirs(os.path.dirname(app.config["DATABASE"]), exist_ok=True)

    # ── Register database helpers ─────────────────────────────────────────────
    db_init_app(app)

    # ── Initialise database tables on first run ───────────────────────────────
    with app.app_context():
        init_db()

    # ── Register API blueprints ───────────────────────────────────────────────
    app.register_blueprint(expenses_bp)
    app.register_blueprint(budgets_bp)

    # ── Analytics API route ───────────────────────────────────────────────────
    @app.route("/api/analytics/<month>")
    def analytics(month):
        """
        Return JSON with full monthly summary + daily spending breakdown.

        month format: YYYY-MM
        """
        try:
            datetime.strptime(month, "%Y-%m")
        except ValueError:
            return jsonify({"error": "Month must be in YYYY-MM format."}), 400

        db      = get_db()
        summary = get_monthly_summary(db, month)
        daily   = get_daily_spending(db, month)
        recent  = get_recent_expenses(db, month)

        return jsonify({**summary, "daily_spending": daily, "recent_expenses": recent}), 200

    # ── Page routes (return rendered HTML templates) ──────────────────────────

    @app.route("/")
    def dashboard():
        """Main dashboard page."""
        current_month = request.args.get("month", datetime.now().strftime("%Y-%m"))
        return render_template(
            "dashboard.html",
            categories=config.EXPENSE_CATEGORIES,
            current_month=current_month,
        )

    @app.route("/transactions")
    def transactions():
        """Transaction history page."""
        current_month = request.args.get("month", datetime.now().strftime("%Y-%m"))
        return render_template(
            "transactions.html",
            categories=config.EXPENSE_CATEGORIES,
            current_month=current_month,
        )

    @app.route("/budget")
    def budget():
        """Budget management page."""
        current_month = request.args.get("month", datetime.now().strftime("%Y-%m"))
        return render_template(
            "budget.html",
            categories=config.EXPENSE_CATEGORIES,
            current_month=current_month,
        )

    # ── Global error handlers ─────────────────────────────────────────────────

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found."}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed."}), 405

    @app.errorhandler(500)
    def internal_error(e):
        # Log the real error server-side but show a safe message to the user.
        app.logger.error("Internal error: %s", e)
        return jsonify({"error": "An internal server error occurred."}), 500

    return app


# ── Entry point ───────────────────────────────────────────────────────────────
# Running `python app.py` starts the development server.
# For production use gunicorn: gunicorn "app:create_app()"
if __name__ == "__main__":
    application = create_app()
    application.run(host="0.0.0.0", port=5000, debug=config.DEBUG)
