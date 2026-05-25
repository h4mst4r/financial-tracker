/**
 * Account API client functions.
 *
 * Handles all account-related API calls with proper credentials,
 * session headers, and CSRF tokens.
 */

// --- Types ---

export interface Account {
  id: string;
  household_id: string;
  name: string;
  type: "cash" | "bank" | "credit_card" | "investment";
  currency: string;
  initial_balance: number;
  current_balance: number;
  opening_date: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AccountCreateData {
  name: string;
  type: "cash" | "bank" | "credit_card" | "investment";
  currency?: string;
  initial_balance?: number;
  opening_date?: string | null;
}

export interface AccountUpdateData {
  name?: string;
  type?: "cash" | "bank" | "credit_card" | "investment";
  currency?: string;
}

export interface AccountSummary {
  combined_balance: number;
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    current_balance: number;
  }>;
  currency: string;
}

// --- API Client ---

const BASE_URL = "http://localhost:8000";

async function getCsrfToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/csrf-token`, {
    credentials: "include",
    headers: {
      "x-session-id": localStorage.getItem("session_id") || "",
    },
  });
  if (!res.ok) throw new Error("Failed to get CSRF token");
  const data = await res.json();
  return data.csrf_token;
}

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.headers) {
    Object.assign(headers, options.headers as Record<string, string>);
  }

  // Add session ID header for cross-port communication
  const sessionId = localStorage.getItem("session_id");
  if (sessionId) {
    headers["x-session-id"] = sessionId;
  }

  return fetch(`${BASE_URL}${url}`, {
    ...options,
    credentials: "include",
    headers,
  });
}

async function apiFetchWithCsrf(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const csrfToken = await getCsrfToken();
  const headers: Record<string, string> = {
    "x-csrf-token": csrfToken,
    "Content-Type": "application/json",
  };
  if (options.headers) {
    Object.assign(headers, options.headers as Record<string, string>);
  }

  return apiFetch(url, { ...options, headers });
}

// --- API Functions ---

export async function listAccounts(
  includeArchived: boolean = false
): Promise<Account[]> {
  const res = await apiFetch(`/api/accounts?include_archived=${includeArchived}`);
  if (!res.ok) throw new Error("Failed to fetch accounts");
  return res.json();
}

export async function createAccount(
  data: AccountCreateData
): Promise<Account> {
  const res = await apiFetchWithCsrf("/api/accounts", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || "Failed to create account");
  }
  return res.json();
}

export async function getAccount(id: string): Promise<Account> {
  const res = await apiFetch(`/api/accounts/${id}`);
  if (!res.ok) throw new Error("Failed to fetch account");
  return res.json();
}

export async function updateAccount(
  id: string,
  data: AccountUpdateData
): Promise<Account> {
  const res = await apiFetchWithCsrf(`/api/accounts/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || "Failed to update account");
  }
  return res.json();
}

export async function archiveAccount(id: string): Promise<Account> {
  const res = await apiFetchWithCsrf(`/api/accounts/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || "Failed to archive account");
  }
  return res.json();
}

export async function restoreAccount(id: string): Promise<Account> {
  const res = await apiFetchWithCsrf(`/api/accounts/${id}/restore`, {
    method: "POST",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || "Failed to restore account");
  }
  return res.json();
}

export async function deleteAccountPermanently(id: string): Promise<{ message: string }> {
  const res = await apiFetchWithCsrf(`/api/accounts/${id}/permanent`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || "Failed to delete account permanently");
  }
  return res.json();
}

export async function getAccountsSummary(): Promise<AccountSummary> {
  const res = await apiFetch("/api/accounts/summary");
  if (!res.ok) throw new Error("Failed to fetch accounts summary");
  return res.json();
}

export async function seedDefaultAccounts(): Promise<Account[]> {
  const res = await apiFetchWithCsrf("/api/accounts/seed-defaults", {
    method: "POST",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || "Failed to seed default accounts");
  }
  return res.json();
}
