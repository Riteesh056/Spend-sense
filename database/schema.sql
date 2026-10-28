-- database/schema.sql
-- -------------------
-- Defines the two tables used by SpendSense.
-- Uses CREATE TABLE IF NOT EXISTS so running this script multiple times
-- never destroys existing records.

-- ── expenses ──────────────────────────────────────────────────────────────────
-- Each row represents one expense entered by the user.
--
-- amount_paise  : Amount stored in integer paise (1 rupee = 100 paise).
--                 Using integers avoids floating-point rounding bugs.
--                 Convert to rupees when displaying: amount_paise / 100.
--
-- category      : One of the fixed categories defined in config.py.
--
-- note          : Optional free-text description the user can add.
--
-- expense_date  : The calendar date the expense occurred (YYYY-MM-DD).
--                 Dashboard totals are calculated from this column, NOT
--                 from created_at, so an expense entered late still lands
--                 in the correct month.
--
-- created_at    : ISO-8601 timestamp of when the row was inserted.
--                 Stored as TEXT (SQLite has no native DATETIME type).

CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    category     TEXT    NOT NULL,
    note         TEXT,
    expense_date TEXT    NOT NULL,   -- YYYY-MM-DD
    created_at   TEXT    NOT NULL    -- YYYY-MM-DD HH:MM:SS
);

-- ── monthly_budgets ───────────────────────────────────────────────────────────
-- One row per calendar month.  Stores the user's allowance and spending limit
-- so the dashboard can calculate remaining balance and budget utilisation.
--
-- month                 : YYYY-MM format, e.g. "2026-10".  The UNIQUE
--                         constraint ensures only one budget record per month.
--
-- allowance_paise       : How much money the user receives / has available
--                         for the month (monthly allowance).
--
-- spending_limit_paise  : The cap the user has set for their spending.
--                         Budget alerts fire at 80 % and 100 % of this value.
--
-- created_at / updated_at : Audit timestamps so we know when the record was
--                            first created and last modified.

CREATE TABLE IF NOT EXISTS monthly_budgets (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    month                TEXT    NOT NULL UNIQUE,  -- YYYY-MM
    allowance_paise      INTEGER NOT NULL CHECK (allowance_paise >= 0),
    spending_limit_paise INTEGER NOT NULL CHECK (spending_limit_paise >= 0),
    created_at           TEXT    NOT NULL,
    updated_at           TEXT    NOT NULL
);
