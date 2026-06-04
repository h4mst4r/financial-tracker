"""0001_initial_schema

Revision ID: 4957ef973a94
Revises:
Create Date: 2026-05-28 16:19:09.676449

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4957ef973a94'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ------------------------------------------------------------------ #
    # audit_logs — no FKs (append-only, plain UUID columns)              #
    # ------------------------------------------------------------------ #
    op.create_table('audit_logs',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('actor_id', sa.Uuid(), nullable=False),
    sa.Column('action', sa.String(length=20), nullable=False),
    sa.Column('entity_type', sa.String(length=50), nullable=False),
    sa.Column('entity_id', sa.Uuid(), nullable=False),
    sa.Column('before_state', sa.Text(), nullable=True),
    sa.Column('after_state', sa.Text(), nullable=True),
    sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('ip_address', sa.String(length=45), nullable=True),
    sa.Column('user_agent', sa.Text(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_actor_id'), 'audit_logs', ['actor_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_entity_id'), 'audit_logs', ['entity_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_household_id'), 'audit_logs', ['household_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_occurred_at'), 'audit_logs', ['occurred_at'], unique=False)

    # ------------------------------------------------------------------ #
    # households — bootstrap entity (no household_id FK)                 #
    # ------------------------------------------------------------------ #
    op.create_table('households',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('base_currency', sa.String(length=3), nullable=False),
    sa.Column('timezone', sa.String(length=50), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )

    # ------------------------------------------------------------------ #
    # currencies — household-scoped, not BaseEntity                      #
    # ------------------------------------------------------------------ #
    op.create_table('currencies',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('code', sa.String(length=3), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('symbol', sa.String(length=5), nullable=False),
    sa.Column('is_base', sa.Boolean(), nullable=False),
    sa.Column('is_display_active', sa.Boolean(), nullable=False),
    sa.Column('rate_to_base', sa.Numeric(precision=10, scale=6), nullable=False),
    sa.Column('fee_pct', sa.Numeric(precision=6, scale=4), nullable=False),
    sa.Column('last_rate_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('rate_source', sa.String(length=100), nullable=True),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('household_id', 'code', name='uq_currencies_household_code')
    )
    op.create_index(op.f('ix_currencies_household_id'), 'currencies', ['household_id'], unique=False)

    # ------------------------------------------------------------------ #
    # persons — BaseEntity                                                #
    # ------------------------------------------------------------------ #
    op.create_table('persons',
    sa.Column('email', sa.String(length=320), nullable=False),
    sa.Column('display_name', sa.String(length=200), nullable=False),
    sa.Column('picture_url', sa.String(length=500), nullable=True),
    sa.Column('role', sa.String(length=20), nullable=False),
    sa.Column('display_currency', sa.String(length=3), nullable=False),
    sa.Column('default_view', sa.String(length=20), nullable=False),
    sa.Column('google_sub', sa.String(length=200), nullable=False),
    sa.Column('last_active_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=False),
    sa.Column('updated_by', sa.Uuid(), nullable=True),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('archived_at', sa.DateTime(), nullable=True),
    sa.Column('archived_by', sa.Uuid(), nullable=True),
    sa.Column('status', sa.Enum('active', 'inactive', 'archived', name='statusenum'), nullable=False),
    sa.ForeignKeyConstraint(['archived_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ),
    sa.ForeignKeyConstraint(['updated_by'], ['persons.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_persons_email'), 'persons', ['email'], unique=True)
    op.create_index(op.f('ix_persons_google_sub'), 'persons', ['google_sub'], unique=True)
    op.create_index('ix_persons_household_email', 'persons', ['household_id', 'email'], unique=False)
    op.create_index(op.f('ix_persons_household_id'), 'persons', ['household_id'], unique=False)
    op.create_index(op.f('ix_persons_archived'), 'persons', ['archived'], unique=False)
    op.create_index(op.f('ix_persons_status'), 'persons', ['status'], unique=False)

    # ------------------------------------------------------------------ #
    # alerts — BaseEntity                                                 #
    # ------------------------------------------------------------------ #
    op.create_table('alerts',
    sa.Column('alert_type', sa.String(length=50), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('entity_type', sa.String(length=50), nullable=True),
    sa.Column('entity_id', sa.Uuid(), nullable=True),
    sa.Column('is_read', sa.Boolean(), nullable=False),
    sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=False),
    sa.Column('updated_by', sa.Uuid(), nullable=True),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('archived_at', sa.DateTime(), nullable=True),
    sa.Column('archived_by', sa.Uuid(), nullable=True),
    sa.Column('status', sa.Enum('active', 'inactive', 'archived', name='statusenum'), nullable=False),
    sa.ForeignKeyConstraint(['archived_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ),
    sa.ForeignKeyConstraint(['updated_by'], ['persons.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_alerts_household_id'), 'alerts', ['household_id'], unique=False)
    op.create_index(op.f('ix_alerts_archived'), 'alerts', ['archived'], unique=False)
    op.create_index(op.f('ix_alerts_status'), 'alerts', ['status'], unique=False)

    # ------------------------------------------------------------------ #
    # categories — BaseEntity                                             #
    # ------------------------------------------------------------------ #
    op.create_table('categories',
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('color', sa.String(length=7), nullable=True),
    sa.Column('icon', sa.String(length=50), nullable=True),
    sa.Column('category_type', sa.String(length=10), nullable=False),
    sa.Column('parent_id', sa.Uuid(), nullable=True),
    sa.Column('depth', sa.Integer(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=False),
    sa.Column('updated_by', sa.Uuid(), nullable=True),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('archived_at', sa.DateTime(), nullable=True),
    sa.Column('archived_by', sa.Uuid(), nullable=True),
    sa.Column('status', sa.Enum('active', 'inactive', 'archived', name='statusenum'), nullable=False),
    sa.CheckConstraint('depth <= 1', name='ck_category_max_depth'),
    sa.ForeignKeyConstraint(['archived_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ),
    sa.ForeignKeyConstraint(['parent_id'], ['categories.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['updated_by'], ['persons.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_categories_household_parent', 'categories', ['household_id', 'parent_id'], unique=False)
    op.create_index(op.f('ix_categories_parent_id'), 'categories', ['parent_id'], unique=False)
    op.create_index(op.f('ix_categories_household_id'), 'categories', ['household_id'], unique=False)
    op.create_index(op.f('ix_categories_archived'), 'categories', ['archived'], unique=False)
    op.create_index(op.f('ix_categories_status'), 'categories', ['status'], unique=False)

    # ------------------------------------------------------------------ #
    # formulas — BaseEntity                                               #
    # ------------------------------------------------------------------ #
    op.create_table('formulas',
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('expression', sa.Text(), nullable=False),
    sa.Column('applies_to', sa.String(length=50), nullable=False),
    sa.Column('is_system', sa.Boolean(), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=False),
    sa.Column('updated_by', sa.Uuid(), nullable=True),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('archived_at', sa.DateTime(), nullable=True),
    sa.Column('archived_by', sa.Uuid(), nullable=True),
    sa.Column('status', sa.Enum('active', 'inactive', 'archived', name='statusenum'), nullable=False),
    sa.ForeignKeyConstraint(['archived_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ),
    sa.ForeignKeyConstraint(['updated_by'], ['persons.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_formulas_household_id'), 'formulas', ['household_id'], unique=False)
    op.create_index(op.f('ix_formulas_archived'), 'formulas', ['archived'], unique=False)
    op.create_index(op.f('ix_formulas_status'), 'formulas', ['status'], unique=False)

    # ------------------------------------------------------------------ #
    # fx_rate_history — not BaseEntity                                    #
    # ------------------------------------------------------------------ #
    op.create_table('fx_rate_history',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('currency_id', sa.Uuid(), nullable=False),
    sa.Column('rate_date', sa.Date(), nullable=False),
    sa.Column('rate_to_base', sa.Numeric(precision=10, scale=6), nullable=False),
    sa.Column('source', sa.String(length=100), nullable=True),
    sa.ForeignKeyConstraint(['currency_id'], ['currencies.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('currency_id', 'rate_date', name='uq_fx_rate_currency_date')
    )

    # ------------------------------------------------------------------ #
    # household_invitations — not BaseEntity                             #
    # ------------------------------------------------------------------ #
    op.create_table('household_invitations',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('invited_email', sa.String(length=320), nullable=False),
    sa.Column('invited_by', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ),
    sa.ForeignKeyConstraint(['invited_by'], ['persons.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    # ------------------------------------------------------------------ #
    # sessions — not BaseEntity                                           #
    # ------------------------------------------------------------------ #
    op.create_table('sessions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('person_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_activity_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('csrf_token', sa.String(length=255), nullable=False),
    sa.Column('ip_address', sa.String(length=45), nullable=True),
    sa.Column('user_agent', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['person_id'], ['persons.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('csrf_token')
    )

    # ------------------------------------------------------------------ #
    # accounts — BaseEntity + MonetaryValueMixin (STI)                   #
    # ------------------------------------------------------------------ #
    op.create_table('accounts',
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('account_type', sa.String(length=30), nullable=False),
    sa.Column('institution', sa.String(length=200), nullable=True),
    sa.Column('month_year', sa.String(length=7), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('account_number', sa.String(length=50), nullable=True),
    sa.Column('interest_rate', sa.Numeric(precision=8, scale=4), nullable=True),
    sa.Column('interest_frequency', sa.String(length=20), nullable=True),
    sa.Column('credit_limit', sa.Numeric(precision=15, scale=4), nullable=True),
    sa.Column('billing_day', sa.Integer(), nullable=True),
    sa.Column('due_day', sa.Integer(), nullable=True),
    sa.Column('reward_points', sa.Integer(), nullable=True),
    sa.Column('annual_fee', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('investment_type', sa.String(length=30), nullable=True),
    sa.Column('cost_basis', sa.Numeric(precision=15, scale=4), nullable=True),
    sa.Column('current_value', sa.Numeric(precision=15, scale=4), nullable=True),
    sa.Column('asset_type', sa.String(length=30), nullable=True),
    sa.Column('purchase_date', sa.Date(), nullable=True),
    sa.Column('purchase_value', sa.Numeric(precision=15, scale=4), nullable=True),
    sa.Column('depreciation_formula_id', sa.Uuid(), nullable=True),
    sa.Column('policy_type', sa.String(length=50), nullable=True),
    sa.Column('coverage_types', sa.Text(), nullable=True),
    sa.Column('premium_frequency', sa.String(length=20), nullable=True),
    sa.Column('coverage_amount', sa.Numeric(precision=15, scale=4), nullable=True),
    sa.Column('insurer', sa.String(length=200), nullable=True),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('amount', sa.Numeric(precision=15, scale=4), nullable=False),
    sa.Column('fx_rate', sa.Numeric(precision=10, scale=6), nullable=False),
    sa.Column('amount_base_calculated', sa.Numeric(precision=15, scale=4), nullable=False),
    sa.Column('amount_base', sa.Numeric(precision=15, scale=4), nullable=False),
    sa.Column('fx_delta', sa.Numeric(precision=15, scale=4), nullable=True),
    sa.Column('fee_amount', sa.Numeric(precision=15, scale=4), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=False),
    sa.Column('updated_by', sa.Uuid(), nullable=True),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('archived_at', sa.DateTime(), nullable=True),
    sa.Column('archived_by', sa.Uuid(), nullable=True),
    sa.Column('status', sa.Enum('active', 'inactive', 'archived', name='statusenum'), nullable=False),
    sa.ForeignKeyConstraint(['archived_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['depreciation_formula_id'], ['formulas.id'], ),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ),
    sa.ForeignKeyConstraint(['updated_by'], ['persons.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_accounts_account_type'), 'accounts', ['account_type'], unique=False)
    op.create_index('ix_accounts_household_type', 'accounts', ['household_id', 'account_type'], unique=False)
    op.create_index(op.f('ix_accounts_household_id'), 'accounts', ['household_id'], unique=False)
    op.create_index(op.f('ix_accounts_archived'), 'accounts', ['archived'], unique=False)
    op.create_index(op.f('ix_accounts_status'), 'accounts', ['status'], unique=False)

    # ------------------------------------------------------------------ #
    # budgets — BaseEntity                                                #
    # ------------------------------------------------------------------ #
    op.create_table('budgets',
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('category_id', sa.Uuid(), nullable=False),
    sa.Column('owner_person_id', sa.Uuid(), nullable=True),
    sa.Column('period_type', sa.String(length=20), nullable=False),
    sa.Column('limit_currency', sa.String(length=3), nullable=False),
    sa.Column('limit_amount', sa.Numeric(precision=15, scale=4), nullable=False),
    sa.Column('limit_amount_base', sa.Numeric(precision=15, scale=4), nullable=False),
    sa.Column('period_start', sa.Date(), nullable=False),
    sa.Column('period_end', sa.Date(), nullable=False),
    sa.Column('alert_threshold_pct', sa.Integer(), nullable=False),
    sa.Column('rollover', sa.Boolean(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=False),
    sa.Column('updated_by', sa.Uuid(), nullable=True),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('archived_at', sa.DateTime(), nullable=True),
    sa.Column('archived_by', sa.Uuid(), nullable=True),
    sa.Column('status', sa.Enum('active', 'inactive', 'archived', name='statusenum'), nullable=False),
    sa.ForeignKeyConstraint(['archived_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ),
    sa.ForeignKeyConstraint(['owner_person_id'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['updated_by'], ['persons.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_budgets_category_id'), 'budgets', ['category_id'], unique=False)
    op.create_index('ix_budgets_category_period', 'budgets', ['category_id', 'period_start'], unique=False)
    op.create_index('ix_budgets_household_period', 'budgets', ['household_id', 'period_start', 'period_end'], unique=False)
    op.create_index(op.f('ix_budgets_household_id'), 'budgets', ['household_id'], unique=False)
    op.create_index(op.f('ix_budgets_archived'), 'budgets', ['archived'], unique=False)
    op.create_index(op.f('ix_budgets_status'), 'budgets', ['status'], unique=False)

    # ------------------------------------------------------------------ #
    # account_owners — junction table, not BaseEntity                    #
    # ------------------------------------------------------------------ #
    op.create_table('account_owners',
    sa.Column('account_id', sa.Uuid(), nullable=False),
    sa.Column('person_id', sa.Uuid(), nullable=False),
    sa.Column('is_primary', sa.Boolean(), nullable=False),
    sa.Column('added_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ),
    sa.ForeignKeyConstraint(['person_id'], ['persons.id'], ),
    sa.PrimaryKeyConstraint('account_id', 'person_id')
    )

    # ------------------------------------------------------------------ #
    # financial_events — BaseEntity + MonetaryValueMixin (STI)           #
    # Includes: account_id (base required FK) + payee (string field)     #
    # ------------------------------------------------------------------ #
    op.create_table('financial_events',
    sa.Column('name', sa.String(length=300), nullable=False),
    sa.Column('event_date', sa.Date(), nullable=False),
    sa.Column('event_type', sa.String(length=30), nullable=False),
    sa.Column('account_id', sa.Uuid(), nullable=False),
    sa.Column('payee', sa.String(length=200), nullable=True),
    sa.Column('transaction_status', sa.String(length=20), nullable=False),
    sa.Column('payee_person_id', sa.Uuid(), nullable=True),
    sa.Column('payment_method', sa.String(length=100), nullable=True),
    sa.Column('category_id', sa.Uuid(), nullable=True),
    sa.Column('transaction_type', sa.String(length=20), nullable=False),
    sa.Column('is_shared_expense', sa.Boolean(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('is_gst_claimable', sa.Boolean(), nullable=False),
    sa.Column('is_gift', sa.Boolean(), nullable=False),
    sa.Column('source_account_id', sa.Uuid(), nullable=True),
    sa.Column('linked_recurring_id', sa.Uuid(), nullable=True),
    sa.Column('reconciled', sa.Boolean(), nullable=False),
    sa.Column('reconciled_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('duplicate_of', sa.Uuid(), nullable=True),
    sa.Column('frequency_text', sa.String(length=200), nullable=True),
    sa.Column('frequency_rule', sa.Text(), nullable=True),
    sa.Column('next_occurrence', sa.Date(), nullable=True),
    sa.Column('recurrence_start_date', sa.Date(), nullable=True),
    sa.Column('recurrence_end_date', sa.Date(), nullable=True),
    sa.Column('source_entity_type', sa.String(length=30), nullable=True),
    sa.Column('source_entity_id', sa.Uuid(), nullable=True),
    sa.Column('occurrences_generated', sa.Integer(), nullable=False),
    sa.Column('last_processed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('destination_account_id', sa.Uuid(), nullable=True),
    sa.Column('dest_currency', sa.String(length=3), nullable=True),
    sa.Column('dest_amount', sa.Numeric(precision=15, scale=4), nullable=True),
    sa.Column('dest_amount_base', sa.Numeric(precision=15, scale=4), nullable=True),
    sa.Column('is_debt_repayment', sa.Boolean(), nullable=False),
    sa.Column('debt_cleared_amount', sa.Numeric(precision=15, scale=4), nullable=True),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('amount', sa.Numeric(precision=15, scale=4), nullable=False),
    sa.Column('fx_rate', sa.Numeric(precision=10, scale=6), nullable=False),
    sa.Column('amount_base_calculated', sa.Numeric(precision=15, scale=4), nullable=False),
    sa.Column('amount_base', sa.Numeric(precision=15, scale=4), nullable=False),
    sa.Column('fx_delta', sa.Numeric(precision=15, scale=4), nullable=True),
    sa.Column('fee_amount', sa.Numeric(precision=15, scale=4), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=False),
    sa.Column('updated_by', sa.Uuid(), nullable=True),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('archived_at', sa.DateTime(), nullable=True),
    sa.Column('archived_by', sa.Uuid(), nullable=True),
    sa.Column('status', sa.Enum('active', 'inactive', 'archived', name='statusenum'), nullable=False),
    sa.CheckConstraint("(is_shared_expense = 0) OR (transaction_type = 'outflow')", name='ck_shared_expense_outflow_only'),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ),
    sa.ForeignKeyConstraint(['archived_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['destination_account_id'], ['accounts.id'], ),
    sa.ForeignKeyConstraint(['duplicate_of'], ['financial_events.id'], ),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ),
    sa.ForeignKeyConstraint(['linked_recurring_id'], ['financial_events.id'], ),
    sa.ForeignKeyConstraint(['payee_person_id'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['source_account_id'], ['accounts.id'], ),
    sa.ForeignKeyConstraint(['updated_by'], ['persons.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_events_household_category', 'financial_events', ['household_id', 'category_id'], unique=False)
    op.create_index('ix_events_household_date', 'financial_events', ['household_id', 'event_date'], unique=False)
    op.create_index('ix_events_household_payee', 'financial_events', ['household_id', 'payee_person_id'], unique=False)
    op.create_index('ix_events_shared_expense', 'financial_events', ['household_id', 'is_shared_expense', 'transaction_type'], unique=False)
    op.create_index(op.f('ix_financial_events_account_id'), 'financial_events', ['account_id'], unique=False)
    op.create_index(op.f('ix_financial_events_category_id'), 'financial_events', ['category_id'], unique=False)
    op.create_index(op.f('ix_financial_events_event_date'), 'financial_events', ['event_date'], unique=False)
    op.create_index(op.f('ix_financial_events_event_type'), 'financial_events', ['event_type'], unique=False)
    op.create_index(op.f('ix_financial_events_is_shared_expense'), 'financial_events', ['is_shared_expense'], unique=False)
    op.create_index(op.f('ix_financial_events_payee_person_id'), 'financial_events', ['payee_person_id'], unique=False)
    op.create_index(op.f('ix_financial_events_source_account_id'), 'financial_events', ['source_account_id'], unique=False)
    op.create_index(op.f('ix_financial_events_household_id'), 'financial_events', ['household_id'], unique=False)
    op.create_index(op.f('ix_financial_events_archived'), 'financial_events', ['archived'], unique=False)
    op.create_index(op.f('ix_financial_events_status'), 'financial_events', ['status'], unique=False)

    # ------------------------------------------------------------------ #
    # recurring_configs — BaseEntity                                      #
    # Renamed: enabled → is_active, next_occurrence → next_due_date      #
    # ------------------------------------------------------------------ #
    op.create_table('recurring_configs',
    sa.Column('account_id', sa.Uuid(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('frequency_text', sa.String(length=200), nullable=False),
    sa.Column('frequency_rule', sa.Text(), nullable=False),
    sa.Column('next_due_date', sa.Date(), nullable=True),
    sa.Column('payment_method', sa.String(length=100), nullable=True),
    sa.Column('payee_person_id', sa.Uuid(), nullable=True),
    sa.Column('category_id', sa.Uuid(), nullable=True),
    sa.Column('amount_override', sa.Numeric(precision=15, scale=4), nullable=True),
    sa.Column('currency_override', sa.String(length=3), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=False),
    sa.Column('updated_by', sa.Uuid(), nullable=True),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('archived_at', sa.DateTime(), nullable=True),
    sa.Column('archived_by', sa.Uuid(), nullable=True),
    sa.Column('status', sa.Enum('active', 'inactive', 'archived', name='statusenum'), nullable=False),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ),
    sa.ForeignKeyConstraint(['archived_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ),
    sa.ForeignKeyConstraint(['payee_person_id'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['updated_by'], ['persons.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('account_id')
    )
    op.create_index(op.f('ix_recurring_configs_household_id'), 'recurring_configs', ['household_id'], unique=False)
    op.create_index(op.f('ix_recurring_configs_archived'), 'recurring_configs', ['archived'], unique=False)
    op.create_index(op.f('ix_recurring_configs_status'), 'recurring_configs', ['status'], unique=False)

    # ------------------------------------------------------------------ #
    # valuation_records — BaseEntity                                      #
    # Renamed: asset_id → account_id                                     #
    # ------------------------------------------------------------------ #
    op.create_table('valuation_records',
    sa.Column('account_id', sa.Uuid(), nullable=False),
    sa.Column('valuation_date', sa.Date(), nullable=False),
    sa.Column('value', sa.Numeric(precision=15, scale=4), nullable=False),
    sa.Column('value_currency', sa.String(length=3), nullable=False),
    sa.Column('value_base', sa.Numeric(precision=15, scale=4), nullable=False),
    sa.Column('source', sa.String(length=50), nullable=False),
    sa.Column('formula_id', sa.Uuid(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=False),
    sa.Column('updated_by', sa.Uuid(), nullable=True),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('archived_at', sa.DateTime(), nullable=True),
    sa.Column('archived_by', sa.Uuid(), nullable=True),
    sa.Column('status', sa.Enum('active', 'inactive', 'archived', name='statusenum'), nullable=False),
    sa.ForeignKeyConstraint(['archived_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['persons.id'], ),
    sa.ForeignKeyConstraint(['formula_id'], ['formulas.id'], ),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ),
    sa.ForeignKeyConstraint(['updated_by'], ['persons.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_valuation_records_account_id'), 'valuation_records', ['account_id'], unique=False)
    op.create_index('ix_valuations_account_date', 'valuation_records', ['account_id', 'valuation_date'], unique=False)
    op.create_index(op.f('ix_valuation_records_household_id'), 'valuation_records', ['household_id'], unique=False)
    op.create_index(op.f('ix_valuation_records_archived'), 'valuation_records', ['archived'], unique=False)
    op.create_index(op.f('ix_valuation_records_status'), 'valuation_records', ['status'], unique=False)

    # ------------------------------------------------------------------ #
    # occurrence_records — not BaseEntity                                 #
    # ------------------------------------------------------------------ #
    op.create_table('occurrence_records',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('recurring_event_id', sa.Uuid(), nullable=False),
    sa.Column('expected_date', sa.Date(), nullable=False),
    sa.Column('occurrence_status', sa.String(length=20), nullable=False),
    sa.Column('generated_event_id', sa.Uuid(), nullable=True),
    sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['generated_event_id'], ['financial_events.id'], ),
    sa.ForeignKeyConstraint(['recurring_event_id'], ['financial_events.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_occurrence_records_recurring_event_id'), 'occurrence_records', ['recurring_event_id'], unique=False)
    op.create_index('ix_occurrences_recurring_date', 'occurrence_records', ['recurring_event_id', 'expected_date'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_occurrences_recurring_date', table_name='occurrence_records')
    op.drop_index(op.f('ix_occurrence_records_recurring_event_id'), table_name='occurrence_records')
    op.drop_table('occurrence_records')

    op.drop_index(op.f('ix_valuation_records_status'), table_name='valuation_records')
    op.drop_index(op.f('ix_valuation_records_archived'), table_name='valuation_records')
    op.drop_index(op.f('ix_valuation_records_household_id'), table_name='valuation_records')
    op.drop_index('ix_valuations_account_date', table_name='valuation_records')
    op.drop_index(op.f('ix_valuation_records_account_id'), table_name='valuation_records')
    op.drop_table('valuation_records')

    op.drop_index(op.f('ix_recurring_configs_status'), table_name='recurring_configs')
    op.drop_index(op.f('ix_recurring_configs_archived'), table_name='recurring_configs')
    op.drop_index(op.f('ix_recurring_configs_household_id'), table_name='recurring_configs')
    op.drop_table('recurring_configs')

    op.drop_index(op.f('ix_financial_events_status'), table_name='financial_events')
    op.drop_index(op.f('ix_financial_events_archived'), table_name='financial_events')
    op.drop_index(op.f('ix_financial_events_household_id'), table_name='financial_events')
    op.drop_index(op.f('ix_financial_events_source_account_id'), table_name='financial_events')
    op.drop_index(op.f('ix_financial_events_payee_person_id'), table_name='financial_events')
    op.drop_index(op.f('ix_financial_events_is_shared_expense'), table_name='financial_events')
    op.drop_index(op.f('ix_financial_events_event_type'), table_name='financial_events')
    op.drop_index(op.f('ix_financial_events_event_date'), table_name='financial_events')
    op.drop_index(op.f('ix_financial_events_category_id'), table_name='financial_events')
    op.drop_index(op.f('ix_financial_events_account_id'), table_name='financial_events')
    op.drop_index('ix_events_shared_expense', table_name='financial_events')
    op.drop_index('ix_events_household_payee', table_name='financial_events')
    op.drop_index('ix_events_household_date', table_name='financial_events')
    op.drop_index('ix_events_household_category', table_name='financial_events')
    op.drop_table('financial_events')

    op.drop_table('account_owners')

    op.drop_index(op.f('ix_budgets_status'), table_name='budgets')
    op.drop_index(op.f('ix_budgets_archived'), table_name='budgets')
    op.drop_index(op.f('ix_budgets_household_id'), table_name='budgets')
    op.drop_index('ix_budgets_household_period', table_name='budgets')
    op.drop_index('ix_budgets_category_period', table_name='budgets')
    op.drop_index(op.f('ix_budgets_category_id'), table_name='budgets')
    op.drop_table('budgets')

    op.drop_index(op.f('ix_accounts_status'), table_name='accounts')
    op.drop_index(op.f('ix_accounts_archived'), table_name='accounts')
    op.drop_index(op.f('ix_accounts_household_id'), table_name='accounts')
    op.drop_index('ix_accounts_household_type', table_name='accounts')
    op.drop_index(op.f('ix_accounts_account_type'), table_name='accounts')
    op.drop_table('accounts')

    op.drop_table('sessions')
    op.drop_table('household_invitations')
    op.drop_table('fx_rate_history')

    op.drop_index(op.f('ix_formulas_status'), table_name='formulas')
    op.drop_index(op.f('ix_formulas_archived'), table_name='formulas')
    op.drop_index(op.f('ix_formulas_household_id'), table_name='formulas')
    op.drop_table('formulas')

    op.drop_index(op.f('ix_categories_status'), table_name='categories')
    op.drop_index(op.f('ix_categories_archived'), table_name='categories')
    op.drop_index(op.f('ix_categories_household_id'), table_name='categories')
    op.drop_index(op.f('ix_categories_parent_id'), table_name='categories')
    op.drop_index('ix_categories_household_parent', table_name='categories')
    op.drop_table('categories')

    op.drop_index(op.f('ix_alerts_status'), table_name='alerts')
    op.drop_index(op.f('ix_alerts_archived'), table_name='alerts')
    op.drop_index(op.f('ix_alerts_household_id'), table_name='alerts')
    op.drop_table('alerts')

    op.drop_index(op.f('ix_persons_status'), table_name='persons')
    op.drop_index(op.f('ix_persons_archived'), table_name='persons')
    op.drop_index(op.f('ix_persons_household_id'), table_name='persons')
    op.drop_index('ix_persons_household_email', table_name='persons')
    op.drop_index(op.f('ix_persons_google_sub'), table_name='persons')
    op.drop_index(op.f('ix_persons_email'), table_name='persons')
    op.drop_table('persons')

    op.drop_index(op.f('ix_currencies_household_id'), table_name='currencies')
    op.drop_table('currencies')
    op.drop_table('households')

    op.drop_index(op.f('ix_audit_logs_occurred_at'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_household_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_entity_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_actor_id'), table_name='audit_logs')
    op.drop_table('audit_logs')
