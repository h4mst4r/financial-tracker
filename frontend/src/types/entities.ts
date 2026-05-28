/**
 * Shared TypeScript interfaces for Financial Tracker entities.
 * Mirrors backend SQLAlchemy models (backend/models/).
 * Field names in camelCase per EDP naming conventions.
 *
 * Authority: entity-design-philosophy.md �3
 */

// Use string for UUID in browser context (no crypto.UUID type)
export type Id = string;

/** Status lifecycle shared by all entities [EDP �3.4] */
const StatusEnum = {
  Active: 'active' as const,
  Inactive: 'inactive' as const,
  Archived: 'archived' as const,
}
export type StatusEnum = (typeof StatusEnum)[keyof typeof StatusEnum]
export { StatusEnum }

/** Base entity fields inherited by ALL entities [EDP �3.1] */
export interface BaseEntity {
  id: Id;
  householdId: Id;
  createdAt: string; // ISO 8601 datetime (UTC)
  updatedAt: string; // ISO 8601 datetime (UTC)
  createdBy: PersonRef;
  updatedBy: PersonRef | null;
  archived: boolean;
  archivedAt: string | null; // ISO 8601 datetime (UTC)
  archivedBy: PersonRef | null;
  status: StatusEnum;
}

/** Monetary value block � appears on every financial entity [EDP �3.2] */
export interface MonetaryValue {
  currency: string; // ISO 4217 code (e.g., 'SGD', 'NZD', 'USD')
  amount: number; // Amount in original currency
  fxRate: number; // Exchange rate from daily FX fetch
  amountBaseCalculated: number; // amount * fxRate � system read-only
  amountBase: number; // User-overridable base currency amount
  fxDelta: number; // amountBaseCalculated - amountBase � forex loss
  feeAmount?: number; // Optional explicit transaction/conversion fee
}

/** Unified person reference [EDP �3.3] */
export interface PersonRef {
  personId: Id;
  displayName: string;
  avatarUrl?: string;
}

/** Account types [EDP �2 � Entity Hierarchy] */
const AccountType = {
  Bank: 'bank' as const,
  Savings: 'savings' as const,
  CreditCard: 'credit_card' as const,
  Capital: 'capital' as const,
  Asset: 'asset' as const,
  Insurance: 'insurance' as const,
}
export type AccountType = (typeof AccountType)[keyof typeof AccountType]
export { AccountType }

/** Financial event types [EDP �2 � Entity Hierarchy] */
const EventType = {
  Transaction: 'transaction' as const,
  RecurringPayment: 'recurring_payment' as const,
  Transfer: 'transfer' as const,
}
export type EventType = (typeof EventType)[keyof typeof EventType]
export { EventType }

/** Common pagination response shape */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Standard API error response shape (matches backend middleware) */
export interface ApiError {
  error: string; // Human-readable message
  code: string;  // SNAKE_CASE error code
  detail?: Record<string, unknown>;
}
