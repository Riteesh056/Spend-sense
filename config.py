"""
config.py
---------
Central configuration for SpendSense.
All environment-specific settings live here so no other file
needs to hard-code paths or secret values.
"""

import os

# Absolute path to the project root (the folder that contains this file)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Database ──────────────────────────────────────────────────────────────────
# The production SQLite file is stored inside a `data/` sub-directory so it
# can be excluded from Git easily.
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(BASE_DIR, "data"))
DATABASE_PATH = os.environ.get("DATABASE_PATH", os.path.join(DATA_DIR, "spendsense.db"))

# Separate database used only during automated tests.
# Tests import this path and pass it to the app factory so real data is
# never touched.
TEST_DATABASE_PATH = os.path.join(DATA_DIR, "spendsense_test.db")

# ── Flask ─────────────────────────────────────────────────────────────────────
# SECRET_KEY is required by Flask for session signing.
# In production set the environment variable; the fallback is only for local
# development.
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")

# Set DEBUG = False before deploying to any public server.
DEBUG = os.environ.get("FLASK_DEBUG", "true").lower() == "true"

# ── Application constants ─────────────────────────────────────────────────────
# Warning thresholds (percentages) for budget utilisation alerts.
BUDGET_WARNING_THRESHOLD = 80   # amber / orange warning
BUDGET_DANGER_THRESHOLD  = 100  # red / exceeded

# Expense categories kept in one place so routes and templates stay in sync.
EXPENSE_CATEGORIES = [
    "Food",
    "Transport",
    "Education",
    "Shopping",
    "Entertainment",
    "Bills & Subscriptions",
    "Health & Personal Care",
    "Other",
]
