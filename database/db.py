"""
database/db.py
--------------
Handles everything related to SQLite for SpendSense.

Key responsibilities
--------------------
1. Provide a helper that returns an open database connection that is
   tied to the current Flask application context (so the same connection is
   reused within one HTTP request and automatically closed when the request
   ends).
2. Expose an `init_db()` function that creates the tables defined in
   schema.sql if they do not already exist.  Running it multiple times is
   safe; it never drops or truncates existing data.
3. Accept an optional `db_path` argument so tests can point the app at a
   throwaway database instead of the real one.
"""

import sqlite3
import os
import click
from flask import g, current_app


def get_db():
    """
    Return the SQLite connection for the current application context.

    Flask's `g` object lives for exactly one request.  We store the
    connection on `g` so that we open at most one connection per request
    and close it automatically via `close_db` (registered in `init_app`).
    """
    if "db" not in g:
        g.db = sqlite3.connect(
            current_app.config["DATABASE"],
            detect_types=sqlite3.PARSE_DECLTYPES,
        )
        # Return rows as dict-like objects so columns can be accessed by name
        # (e.g. row["amount_paise"]) rather than by position index.
        g.db.row_factory = sqlite3.Row

    return g.db


def close_db(error=None):
    """Pop the database connection from `g` and close it."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """
    Execute schema.sql against the current database.

    schema.sql uses CREATE TABLE IF NOT EXISTS, so calling this function on
    an existing database with data is completely safe.
    """
    db = get_db()

    # Resolve the path to schema.sql relative to this file, not the CWD.
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    with open(schema_path, "r", encoding="utf-8") as f:
        db.executescript(f.read())

    db.commit()


def init_app(app):
    """
    Register database helpers with a Flask application instance.

    Call this from app.py after creating the Flask app.  It:
    - Ensures the data directory exists before any request is served.
    - Registers `close_db` as a teardown function (runs after every request).
    - Adds a `flask init-db` CLI command for convenience.
    """
    # Make sure the directory that will hold the .db file exists.
    os.makedirs(os.path.dirname(app.config["DATABASE"]), exist_ok=True)

    app.teardown_appcontext(close_db)

    @app.cli.command("init-db")
    def init_db_command():
        """Create the database tables (safe to run on an existing database)."""
        with app.app_context():
            init_db()
        click.echo("Database initialised successfully.")
