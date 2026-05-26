---
story_id: 3-3
title: Account Management
epic: 3
status: done
created: 2026-05-26
completed: 2026-05-26
depends_on: []
prerequisites:
  - Epic 1 complete (households, auth)
  - Epic 2 complete (categories)
---

# Story 3.3: Account Management

As a user,
I want to create and manage multiple accounts (Cash, Bank, Credit Card),
So that I can track all my finances in one place.

## Context

This story establishes the `Account` model which is a **required dependency** for Stories 3.1 (Quick Transaction Entry), 3.4 (Inter-Account Transfers), and any future story that references accounts. Getting the data model right here is critical.

## Requirements

### Data Model: Account

```python
class Account(Base):
    __tablename__ = "accounts"

    id: UUID              # Primary key
    household_id: UUID    # FK -> households.id
    name: str             # Display name (e.g., "OCBC Savings", "POSB Debit")
    type: str             # Enum: cash, bank, credit_card, investment
    currency: str         # ISO 4217 code, default "SGD"
    initial_balance: Decimal  # Balance at time of account creation
    opening_date: date   # When the account was opened/added
    is_active: bool      # Soft delete - False means archived
    is_default: bool     # System-created default accounts can't be deleted
    created_at: datetime
    updated_at: datetime

    # Relationships
    transactions: List[Transaction]  # Forward reference
```

### Backend Routes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/accounts` | List all accounts for current household | Required |
| POST | `/api/accounts` | Create new account | Required |
| GET | `/api/accounts/{id}` | Get account details | Required |
| PUT | `/api/accounts/{id}` | Update account (name, type, etc.) | Required |
| DELETE | `/api/accounts/{id}` | Archive account (soft delete) | Required |
| GET | `/api/accounts/summary` | Dashboard summary - combined balance, per-account balances | Required |

### Backend Service Layer

Create `backend/services/account_service.py`:

- `list_accounts(household_id)` - All active accounts, ordered by type then name
- `create_account(household_id, name, type, currency, initial_balance, opening_date)` - Validation: unique name within household, valid account type
- `get_account(account_id, household_id)` - Verify account belongs to household
- `update_account(account_id, household_id, **updates)` - Field-level updates
- `archive_account(account_id, household_id)` - Set is_active=False; fail if account has transactions (require transfer first)
- `calculate_current_balance(account_id)` - initial_balance + SUM(transactions where account_id)
- `get_accounts_summary(household_id)` - Combined balance across all accounts, per-account breakdown

### Frontend Components

**AccountManager.tsx** - New page component:
- Table/list of all accounts with columns: Name, Type (icon), Currency, Balance, Actions
- "Add Account" button opening a modal form
- Edit inline or via modal
- Archive confirmation dialog
- Account type icons (cash = wallet, bank = building, credit_card = card)

**AccountSelector.tsx** - Reusable dropdown component:
- Used by transaction entry forms to select source/destination account
- Shows account name + current balance in dropdown options
- Grouped by account type

### Default Accounts on First Use

When a user first navigates to the accounts page (or on household creation), seed 3 default accounts if none exist:

| Name | Type | Initial Balance |
|------|------|-----------------|
| Cash Wallet | cash | 0.00 |
| Bank Account | bank | 0.00 |
| Credit Card | credit_card | 0.00 |

These are marked `is_default=True` and cannot be deleted (only archived with warning).

## Acceptance Criteria

### AC1: Create Account
**Given** I am on the Accounts page
**When** I click "Add Account"
**Then** a form appears with fields for name, type (Cash, Bank, Credit Card), currency, and initial balance
**And** after saving, the account appears in the accounts list with its current balance

### AC2: View Accounts Dashboard
**Given** I have multiple accounts
**When** I view the dashboard
**Then** I see the combined balance across all accounts
**And** I can filter transactions by account

### AC3: Edit Account
**Given** I have an existing account
**When** I click edit on the account
**Then** I can modify the name, type, and currency
**And** changes are reflected immediately in the list

### AC4: Archive Account with Transaction Check
**Given** I have an account with transactions
**When** I try to archive it
**Then** I see an error "Cannot archive account with existing transactions"
**And** I am prompted to transfer or delete the transactions first

### AC5: Default Accounts Seeding
**Given** I am viewing accounts for the first time (no accounts exist)
**When** I navigate to the Accounts page
**Then** 3 default accounts are created: Cash Wallet, Bank Account, Credit Card
**And** each has an initial balance of 0.00

## Technical Notes

- Currency field stores ISO 4217 codes (SGD, USD, EUR, etc.) - validation with a small allowlist initially
- Balance calculation: `initial_balance + SUM(amount)` for all transactions on that account. Positive amounts = income/deposit, negative amounts = expense/withdrawal
- Account type enum should be a Python Enum class for type safety
- The `/api/accounts/summary` endpoint should be efficient - single query with GROUP BY rather than N+1 balance calculations
- Consider adding a unique constraint on `(household_id, name)` to prevent duplicate account names

## Files to Create/Modify

### New Files
- `backend/services/account_service.py`
- `frontend/src/api/accounts.ts`
- `frontend/src/components/AccountManager.tsx`
- `frontend/src/components/AccountSelector.tsx`

### Modified Files
- `backend/models.py` - Add Account model
- `backend/routes/accounts.py` - New route module
- `backend/main.py` - Register accounts router
- `frontend/src/App.tsx` - Add Accounts route/page
- `backend/database.py` - Migration for accounts table

## Story Points: 5
## Estimated Time: 1 day
