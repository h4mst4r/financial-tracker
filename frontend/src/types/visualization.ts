/**
 * Visualization filter and aggregation response types.
 * Mirrors EDP §13.5 VisualizationFilter specification.
 *
 * Authority: entity-design-philosophy.md §13.5
 */

import { startOfMonth, endOfMonth } from 'date-fns';

// --- Time Presets ---

const TimePreset = {
  month: 'month' as const,
  quarter: 'quarter' as const,
  year: 'year' as const,
  all_time: 'all_time' as const,
  custom: 'custom' as const,
};
export type TimePreset = (typeof TimePreset)[keyof typeof TimePreset];
export { TimePreset };

// --- Currency Mode ---

const CurrencyMode = {
  raw: 'raw' as const,
  converted: 'converted' as const,
};
export type CurrencyMode = (typeof CurrencyMode)[keyof typeof CurrencyMode];
export { CurrencyMode };

// --- Transaction Type Filter ---

const TransactionType = {
  all: 'all' as const,
  inflow: 'inflow' as const,
  outflow: 'outflow' as const,
};
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];
export { TransactionType };

// --- Comparison Mode ---

const ComparisonMode = {
  persons: 'persons' as const,
  categories: 'categories' as const,
} as const;
export type ComparisonMode = (typeof ComparisonMode)[keyof typeof ComparisonMode] | null;
export { ComparisonMode };

// --- Comparison Group By ---

const ComparisonGroupBy = {
  category: 'category' as const,
  month: 'month' as const,
  quarter: 'quarter' as const,
  year: 'year' as const,
  payment_method: 'payment_method' as const,
} as const;
export type ComparisonGroupBy =
  (typeof ComparisonGroupBy)[keyof typeof ComparisonGroupBy] | null;
export { ComparisonGroupBy };

// --- Time Range ---

export interface TimeRange {
  start: Date;
  end: Date;
  preset: TimePreset;
}

// --- Visualization Filter (EDP §13.5) ---

export interface VisualizationFilter {
  time_range: TimeRange;
  person_ids: string[]; // Empty = household aggregate view
  category_ids: string[]; // Empty = all categories; set on chart segment click
  account_ids: string[]; // Empty = all accounts
  currency_mode: CurrencyMode;
  display_currency: string; // ISO 4217, from EntityPerson.display_currency
  transaction_type: TransactionType;

  // Comparison mode — mutually exclusive with standard single-entity filtering
  comparison_mode: ComparisonMode;
  comparison_ids: string[]; // Person IDs or Category IDs to compare
  comparison_group_by: ComparisonGroupBy;
}

// --- Default Filter Factory ---

export function defaultVisualizationFilter(displayCurrency = 'USD'): VisualizationFilter {
  const now = new Date();
  return {
    time_range: {
      start: startOfMonth(now),
      end: endOfMonth(now),
      preset: TimePreset.month,
    },
    person_ids: [],
    category_ids: [],
    account_ids: [],
    currency_mode: CurrencyMode.raw,
    display_currency: displayCurrency,
    transaction_type: TransactionType.all,
    comparison_mode: null,
    comparison_ids: [],
    comparison_group_by: null,
  };
}

// --- Aggregation Response Types ---

/** Single data point returned by aggregation endpoints */
export interface AggregationDataPoint {
  /** Label for the x-axis or legend (e.g., category name, month string) */
  label: string;
  /** ISO date for time-series points */
  date?: string;
  /** Values keyed by entity (person, category, account) for multi-series charts */
  values: Record<string, number>;
  /** Total across all series at this point */
  total: number;
}

/** Raw currency breakdown — returned alongside converted totals */
export interface RawCurrencyBreakdown {
  currency: string; // ISO 4217
  amount: number;
}

/** Response envelope from visualization aggregation endpoints */
export interface AggregationResponse {
  /** Array of data points for chart rendering */
  data: AggregationDataPoint[];
  /** Filter that was applied on the server side */
  filter: Partial<VisualizationFilter>;
  /** Raw currency breakdowns per data point (for raw mode toggle) */
  rawBreakdowns?: RawCurrencyBreakdown[][];
  /** Period the aggregation covers */
  period: {
    start: string; // ISO date
    end: string; // ISO date
  };
}
