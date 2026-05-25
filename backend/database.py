"""Database configuration and initialization."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine, func, text
from sqlalchemy.orm import sessionmaker

from .models import Base, Category, Account

DATABASE_URL = "sqlite:///./financial_tracker.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Suggested default categories for new households (created on-demand via UI)
DEFAULT_EXPENSE_CATEGORIES = [
    {"name": "Groceries", "color": "#4CAF50", "icon": "🛒"},
    {"name": "Transport", "color": "#2196F3", "icon": "🚗"},
    {"name": "Utilities", "color": "#FF9800", "icon": "💡"},
    {"name": "Entertainment", "color": "#9C27B0", "icon": "🎬"},
    {"name": "Healthcare", "color": "#F44336", "icon": "🏥"},
    {"name": "Education", "color": "#3F51B5", "icon": "📚"},
    {"name": "Shopping", "color": "#795548", "icon": "🛍️"},
    {"name": "Dining", "color": "#E91E63", "icon": "🍽️"},
    {"name": "Travel", "color": "#00BCD4", "icon": "✈️"},
    {"name": "Bills", "color": "#607D8B", "icon": "📄"},
    {"name": "Savings", "color": "#8BC34A", "icon": "💰"},
    {"name": "Other", "color": "#9E9E9E", "icon": "📦"},
]

DEFAULT_INCOME_CATEGORIES = [
    {"name": "Salary", "color": "#4CAF50", "icon": "💼"},
    {"name": "Freelance", "color": "#2196F3", "icon": "💻"},
    {"name": "Investments", "color": "#FF9800", "icon": "📈"},
    {"name": "Gifts", "color": "#E91E63", "icon": "🎁"},
    {"name": "Other Income", "color": "#9E9E9E", "icon": "📦"},
]


def get_db():
    """Yield a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_default_category_templates():
    """Return the default category templates for creating household categories.
    
    Returns a list of dicts with (name, color, icon, type) for all suggested defaults.
    These are created as regular household-specific categories on-demand via the UI.
    """
    templates = []
    for cat_data in DEFAULT_EXPENSE_CATEGORIES:
        templates.append({
            "name": cat_data["name"],
            "color": cat_data["color"],
            "icon": cat_data["icon"],
            "type": "expense"
        })
    for cat_data in DEFAULT_INCOME_CATEGORIES:
        templates.append({
            "name": cat_data["name"],
            "color": cat_data["color"],
            "icon": cat_data["icon"],
            "type": "income"
        })
    return templates


def create_default_categories_for_household(db, household_id):
    """Create all default categories for a household as regular household-specific categories.
    
    This is called on-demand when a user clicks 'Create Default Categories' in the UI.
    Creates both expense and income categories with household_id set (not system-wide defaults).
    
    Args:
        db: Database session
        household_id: UUID of the household to create categories for
    
    Returns:
        List of created Category objects
    """
    templates = get_default_category_templates()
    created_categories = []
    
    for template in templates:
        # Check if category already exists (case-insensitive)
        existing = db.query(Category).filter(
            Category.household_id == household_id,
            func.lower(Category.name) == func.lower(template["name"])
        ).first()
        
        if not existing:
            category = Category(
                name=template["name"],
                color=template["color"],
                icon=template.get("icon"),
                type=template["type"],
                household_id=household_id,
                is_default=False  # Regular household-specific category, not system default
            )
            db.add(category)
            created_categories.append(category)
    
    db.commit()
    return created_categories


def _migrate_categories_table():
    """Apply incremental schema migrations to the categories table.

    Handles adding new columns (parent_id) and changing constraints (nullable household_id)
    for existing databases. SQLite requires manual ALTER TABLE for schema changes.
    """
    db = SessionLocal()
    try:
        # Check if categories table exists
        result = db.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='categories'")
        )
        if not result.scalar():
            return  # Table doesn't exist yet, create_all will handle it

        # Get current columns
        result = db.execute(text("PRAGMA table_info(categories)"))
        current_columns = {row[1] for row in result}

        # Add parent_id column if missing
        if "parent_id" not in current_columns:
            print("[MIGRATION] Adding parent_id column to categories")
            db.execute(
                text("ALTER TABLE categories ADD COLUMN parent_id VARCHAR(36) DEFAULT NULL")
            )
            # Add index for parent_id lookups
            try:
                db.execute(text("CREATE INDEX ix_categories_parent_id ON categories(parent_id)"))
            except Exception:
                pass  # Index might already exist

        db.commit()
    except Exception as e:
        print(f"[MIGRATION] Warning during categories migration: {e}")
        db.rollback()
    finally:
        db.close()


def _migrate_accounts_table():
    """Apply incremental schema migrations for the accounts table.

    Creates the accounts table if it doesn't exist and adds account_id to transactions.
    """
    db = SessionLocal()
    try:
        # Check if accounts table exists
        result = db.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'")
        )
        if result.scalar():
            # Table exists - check for missing columns
            result = db.execute(text("PRAGMA table_info(accounts)"))
            current_columns = {row[1] for row in result}

            # Add current_balance column if missing
            if "current_balance" not in current_columns:
                print("[MIGRATION] Adding current_balance column to accounts")
                db.execute(
                    text("ALTER TABLE accounts ADD COLUMN current_balance NUMERIC(12, 2) DEFAULT 0.00")
                )

            db.commit()
        else:
            # Table doesn't exist yet, create_all will handle it
            pass

        # Check if transactions table has account_id column
        result = db.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'")
        )
        if result.scalar():
            result = db.execute(text("PRAGMA table_info(transactions)"))
            current_columns = {row[1] for row in result}

            if "account_id" not in current_columns:
                print("[MIGRATION] Adding account_id column to transactions")
                db.execute(
                    text("ALTER TABLE transactions ADD COLUMN account_id VARCHAR(36) DEFAULT NULL")
                )
                # Add foreign key constraint (SQLite doesn't support ADD CONSTRAINT, so we skip it)
                # The relationship will still work without the FK constraint in SQLAlchemy
                try:
                    db.execute(text("CREATE INDEX ix_transactions_account_id ON transactions(account_id)"))
                except Exception:
                    pass

            db.commit()
    except Exception as e:
        print(f"[MIGRATION] Warning during accounts migration: {e}")
        db.rollback()
    finally:
        db.close()


def init_db():
    """Create all tables in the database."""
    Base.metadata.create_all(bind=engine)
    _migrate_categories_table()
    _migrate_accounts_table()
