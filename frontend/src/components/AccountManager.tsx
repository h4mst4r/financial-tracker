import { useState } from "react";
import {
  listAccounts,
  createAccount,
  updateAccount,
  archiveAccount,
  restoreAccount,
  deleteAccountPermanently,
  seedDefaultAccounts,
  type Account,
  type AccountCreateData,
  type AccountUpdateData,
} from "../api/accounts";
import { useEntityManager } from "../hooks/useEntityManager";
import { EntityPage } from "./shared/EntityPage";
import { EntityCard } from "./shared/EntityCard";
import { PlusIcon, XIcon, CheckIcon } from "./shared/icons";

// --- Account Type Config ---

type AccountType = "cash" | "bank" | "credit_card" | "investment";

const ACCOUNT_TYPE_CONFIG: Record<AccountType, { label: string; icon: string; color: string }> = {
  cash: { label: "Cash", icon: "💰", color: "#69f0ae" },
  bank: { label: "Bank", icon: "🏦", color: "#4fc3f7" },
  credit_card: { label: "Credit Card", icon: "💳", color: "#ff5252" },
  investment: { label: "Investment", icon: "📈", color: "#ffd740" },
};

const ACCOUNT_TYPES: AccountType[] = ["cash", "bank", "credit_card", "investment"];

const CURRENCIES = ["SGD", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "HKD"];

// --- Format helpers ---

function formatBalance(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

// --- Component ---

export default function AccountManager() {
  // --- Shared entity management hook ---
  const em = useEntityManager<Account>({
    loadAll: (includeArchived) => listAccounts(includeArchived),
    create: (data) => createAccount(data),
    update: (id, data) => updateAccount(id, data),
    archive: (id) => archiveAccount(id),
    restore: (id) => restoreAccount(id),
    deletePermanently: (id) => deleteAccountPermanently(id),
    onArchiveConfirm: (account) => {
      const config = ACCOUNT_TYPE_CONFIG[account.type];
      return `Are you sure you want to archive "${account.name}" (${config.label})?`;
    },
    onDeleteConfirm: (account) => {
      const config = ACCOUNT_TYPE_CONFIG[account.type];
      return `Are you sure you want to permanently delete "${account.name}" (${config.label})? This cannot be undone.`;
    },
  });

  // --- Account-specific form state ---
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<AccountType>("cash");
  const [formCurrency, setFormCurrency] = useState("SGD");
  const [formInitialBalance, setFormInitialBalance] = useState("0.00");

  // Account-specific form reset
  const resetAccountForm = () => {
    setFormName("");
    setFormType("cash");
    setFormCurrency("SGD");
    setFormInitialBalance("0.00");
    em.resetForm();
  };

  // Account-specific create handler
  const handleAccountCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: AccountCreateData = {
      name: formName,
      type: formType,
      currency: formCurrency,
      initial_balance: parseFloat(formInitialBalance) || 0,
    };
    await em.handleCreate(payload);
    resetAccountForm();
  };

  // Account-specific update handler
  const handleAccountUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!em.editingId) return;

    const payload: AccountUpdateData = {};
    if (formName) payload.name = formName;
    if (formType) payload.type = formType;
    if (formCurrency) payload.currency = formCurrency;

    await em.handleUpdate(em.editingId, payload);
    resetAccountForm();
  };

  // Account-specific edit initialization
  const startEditAccount = (account: Account) => {
    setFormName(account.name);
    setFormType(account.type);
    setFormCurrency(account.currency);
    setFormInitialBalance(account.initial_balance.toString());
    em.startEdit(account);
  };

  // Account-specific seed defaults
  const handleSeedDefaults = async () => {
    await em.handleSeedDefaults(
      () => seedDefaultAccounts(),
      "This will create all default accounts (3 total). Accounts that already exist by name will be skipped. Continue?"
    );
  };

  // Calculate combined balance
  const combinedBalance = em.entities.reduce((sum, acc) => sum + acc.current_balance, 0);

  return (
    <EntityPage
      title="Accounts"
      subtitle="Manage your financial accounts"
      loading={em.loading}
      error={em.error}
      includeArchived={em.includeArchived}
      onToggleArchived={em.setIncludeArchived}
      onCreateClick={() => {
        resetAccountForm();
        em.showCreateForm();
      }}
      createButtonLabel="New Account"
      showCreateButton={true}
      renderSeedButton={() =>
        em.entities.length === 0 ? (
          <button
            onClick={handleSeedDefaults}
            disabled={em.seeding}
            className="btn-secondary flex items-center gap-2 px-4 py-2 disabled:opacity-50"
          >
            <PlusIcon />
            <span>{em.seeding ? "Creating..." : "Defaults"}</span>
          </button>
        ) : null
      }
      isEmpty={em.entities.length === 0 && !em.loading}
      emptyMessage="No accounts yet. Create your first account to get started."
    >
      {/* Combined Balance Card (account-specific extension) */}
      {em.entities.length > 0 && (
        <div className="mb-6 rounded-xl bg-surface-elevated border border-border p-5">
          <p className="text-sm text-text-secondary mb-1">Combined Balance</p>
          <p className="text-3xl font-bold text-primary">
            {formatBalance(combinedBalance, "SGD")}
          </p>
          <p className="text-xs text-text-muted mt-1">{em.entities.length} account{em.entities.length !== 1 ? "s" : ""}</p>
        </div>
      )}

      {/* Create/Edit Form (account-specific) */}
      {em.showForm && (
        <div className="bg-surface border border-border rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-primary">
              {em.editingId ? "Edit Account" : "Add New Account"}
            </h2>
            <button onClick={resetAccountForm} className="text-text-secondary hover:text-text">
              <XIcon />
            </button>
          </div>

          <form onSubmit={em.editingId ? handleAccountUpdate : handleAccountCreate} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm text-text-secondary mb-2">
                Account Name *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={em.editingId ? "Account name" : 'e.g., "OCBC Savings", "POSB Debit"'}
                required
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-text placeholder:text-text-muted focus:outline-none focus:border-primary"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm text-text-secondary mb-2">
                Account Type *
              </label>
              <div className="grid grid-cols-4 gap-2">
                {ACCOUNT_TYPES.map((type) => {
                  const config = ACCOUNT_TYPE_CONFIG[type];
                  const isSelected = formType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormType(type)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-surface-elevated text-text-secondary hover:border-text-secondary"
                      }`}
                    >
                      <span className="text-xl">{config.icon}</span>
                      <span className="text-xs font-medium">{config.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Currency */}
            <div>
              <label className="block text-sm text-text-secondary mb-2">
                Currency
              </label>
              <select
                value={formCurrency}
                onChange={(e) => setFormCurrency(e.target.value)}
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
              >
                {CURRENCIES.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur}
                  </option>
                ))}
              </select>
            </div>

            {/* Initial Balance (create only) */}
            {!em.editingId && (
              <div>
                <label className="block text-sm text-text-secondary mb-2">
                  Initial Balance
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formInitialBalance}
                  onChange={(e) => setFormInitialBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-text placeholder:text-text-muted focus:outline-none focus:border-primary"
                />
              </div>
            )}

            {/* Error message */}
            {em.formError && (
              <div className="bg-red-900/30 border border-red-500/50 text-red-400 rounded-lg px-4 py-2.5 text-sm">
                {em.formError}
              </div>
            )}

            {/* Submit buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={em.submitting}
                className="btn-primary flex items-center gap-2 px-4 py-2"
              >
                {em.submitting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-background"></div>
                ) : (
                  <CheckIcon />
                )}
                <span>{em.editingId ? "Save Changes" : "Create Account"}</span>
              </button>
              <button
                type="button"
                onClick={resetAccountForm}
                className="px-4 py-2 text-text-secondary hover:text-text transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Accounts List */}
      <div className="space-y-2">
        {em.entities.map((account) => {
          const config = ACCOUNT_TYPE_CONFIG[account.type];
          return (
            <EntityCard
              key={account.id}
              entity={account}
              renderLeft={(acc) => (
                <>
                  <span className="text-2xl" title={config.label}>
                    {ACCOUNT_TYPE_CONFIG[acc.type].icon}
                  </span>
                  <div>
                    <p className="font-medium text-text">{acc.name}</p>
                    <p className="text-xs text-text-muted">
                      {ACCOUNT_TYPE_CONFIG[acc.type].label} &middot; {acc.currency}
                    </p>
                  </div>
                </>
              )}
              renderRight={(acc) => (
                <span className={`font-semibold ${acc.current_balance >= 0 ? "text-text" : "text-error"}`}>
                  {formatBalance(acc.current_balance, acc.currency)}
                </span>
              )}
              onEdit={startEditAccount}
              onArchive={em.handleArchive}
              onRestore={em.handleRestore}
              onDeletePermanently={em.handleDeletePermanently}
            />
          );
        })}
      </div>
    </EntityPage>
  );
}
