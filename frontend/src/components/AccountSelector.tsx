import { useState, useEffect, useMemo } from "react";
import { listAccounts, type Account } from "../api/accounts";

// --- Account Type Config ---

type AccountType = "cash" | "bank" | "credit_card" | "investment";

const ACCOUNT_TYPE_CONFIG: Record<AccountType, { label: string; icon: string }> = {
  cash: { label: "Cash", icon: "💰" },
  bank: { label: "Bank", icon: "🏦" },
  credit_card: { label: "Credit Card", icon: "💳" },
  investment: { label: "Investment", icon: "📈" },
};

// --- Format helpers ---

function formatBalance(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

// --- Component ---

interface AccountSelectorProps {
  value: string | null;
  onChange: (accountId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  showBalance?: boolean;
  error?: string | null;
}

export function AccountSelector({
  value,
  onChange,
  placeholder = "Select an account",
  disabled = false,
  showBalance = true,
  error,
}: AccountSelectorProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    listAccounts()
      .then(setAccounts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Group accounts by type
  const groupedAccounts = useMemo(() => {
    const groups: Record<string, Account[]> = {};
    for (const account of accounts) {
      const label = ACCOUNT_TYPE_CONFIG[account.type]?.label || account.type;
      if (!groups[label]) groups[label] = [];
      groups[label].push(account);
    }
    return groups;
  }, [accounts]);

  const selectedAccount = accounts.find((a) => a.id === value);

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={`w-full flex items-center justify-between bg-surface-elevated border rounded-lg px-3 py-2.5 text-left transition-colors ${
          error
            ? "border-error"
            : open
              ? "border-primary"
              : "border-border hover:border-text-secondary"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {selectedAccount ? (
          <div className="flex items-center gap-2">
            <span>{ACCOUNT_TYPE_CONFIG[selectedAccount.type]?.icon}</span>
            <span className="text-text text-sm">{selectedAccount.name}</span>
            {showBalance && (
              <span className="text-xs text-text-secondary ml-auto">
                {formatBalance(selectedAccount.current_balance, selectedAccount.currency)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-text-muted text-sm">{placeholder}</span>
        )}
        <svg
          className={`w-4 h-4 text-text-secondary transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop to close dropdown */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />

          <div className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-4 text-center text-text-secondary text-sm">
                Loading...
              </div>
            ) : accounts.length === 0 ? (
              <div className="px-3 py-4 text-center text-text-muted text-sm">
                No accounts found
              </div>
            ) : (
              Object.entries(groupedAccounts).map(([groupLabel, groupAccounts]) => (
                <div key={groupLabel}>
                  {/* Group header */}
                  <div className="px-3 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wider sticky top-0 bg-surface z-10">
                    {groupLabel}
                  </div>

                  {/* Account options */}
                  {groupAccounts.map((account) => {
                    const config = ACCOUNT_TYPE_CONFIG[account.type];
                    const isSelected = value === account.id;
                    return (
                      <button
                        key={account.id}
                        type="button"
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? "bg-primary/10 text-primary"
                            : "text-text hover:bg-surface-elevated"
                        }`}
                        onClick={() => {
                          onChange(account.id);
                          setOpen(false);
                        }}
                      >
                        <span className="text-base">{config?.icon}</span>
                        <span className="text-sm flex-1">{account.name}</span>
                        {showBalance && (
                          <span className={`text-xs ${isSelected ? "text-primary" : "text-text-secondary"}`}>
                            {formatBalance(account.current_balance, account.currency)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Error message */}
      {error && <p className="text-error text-xs mt-1">{error}</p>}
    </div>
  );
}

export default AccountSelector;
