/**
 * Tests for visualization types and factory functions.
 */

import { describe, it, expect } from 'vitest';
import {
  TimePreset,
  CurrencyMode,
  TransactionType,
  ComparisonMode,
  ComparisonGroupBy,
  defaultVisualizationFilter,
} from './visualization';
import type { VisualizationFilter, TimeRange } from './visualization';

describe('TimePreset', () => {
  it('has all expected preset values', () => {
    expect(TimePreset.month).toBe('month');
    expect(TimePreset.quarter).toBe('quarter');
    expect(TimePreset.year).toBe('year');
    expect(TimePreset.all_time).toBe('all_time');
    expect(TimePreset.custom).toBe('custom');
  });
});

describe('CurrencyMode', () => {
  it('has raw and converted modes', () => {
    expect(CurrencyMode.raw).toBe('raw');
    expect(CurrencyMode.converted).toBe('converted');
  });
});

describe('TransactionType', () => {
  it('has all, inflow, and outflow types', () => {
    expect(TransactionType.all).toBe('all');
    expect(TransactionType.inflow).toBe('inflow');
    expect(TransactionType.outflow).toBe('outflow');
  });
});

describe('ComparisonMode', () => {
  it('has persons and categories modes', () => {
    expect(ComparisonMode.persons).toBe('persons');
    expect(ComparisonMode.categories).toBe('categories');
  });
});

describe('ComparisonGroupBy', () => {
  it('has all expected group-by values', () => {
    expect(ComparisonGroupBy.category).toBe('category');
    expect(ComparisonGroupBy.month).toBe('month');
    expect(ComparisonGroupBy.quarter).toBe('quarter');
    expect(ComparisonGroupBy.year).toBe('year');
    expect(ComparisonGroupBy.payment_method).toBe('payment_method');
  });
});

describe('defaultVisualizationFilter', () => {
  it('returns a valid VisualizationFilter object', () => {
    const filter = defaultVisualizationFilter();

    expect(filter).toBeDefined();
    expect(filter.time_range).toBeDefined();
    expect(filter.person_ids).toEqual([]);
    expect(filter.category_ids).toEqual([]);
    expect(filter.account_ids).toEqual([]);
  });

  it('defaults to current month time range', () => {
    const filter = defaultVisualizationFilter();
    const now = new Date();

    expect(filter.time_range.preset).toBe(TimePreset.month);
    expect(filter.time_range.start.getMonth()).toBe(now.getMonth());
    expect(filter.time_range.end.getMonth()).toBe(now.getMonth());
    expect(filter.time_range.start.getFullYear()).toBe(now.getFullYear());
    expect(filter.time_range.end.getFullYear()).toBe(now.getFullYear());
  });

  it('defaults to raw currency mode', () => {
    const filter = defaultVisualizationFilter();
    expect(filter.currency_mode).toBe(CurrencyMode.raw);
  });

  it('defaults to all transaction types', () => {
    const filter = defaultVisualizationFilter();
    expect(filter.transaction_type).toBe(TransactionType.all);
  });

  it('defaults to no comparison mode', () => {
    const filter = defaultVisualizationFilter();
    expect(filter.comparison_mode).toBeNull();
    expect(filter.comparison_ids).toEqual([]);
    expect(filter.comparison_group_by).toBeNull();
  });

  it('uses provided display currency', () => {
    const filter = defaultVisualizationFilter('SGD');
    expect(filter.display_currency).toBe('SGD');
  });

  it('defaults to USD when no currency provided', () => {
    const filter = defaultVisualizationFilter();
    expect(filter.display_currency).toBe('USD');
  });

  it('time_range.start is the first day of the month', () => {
    const filter = defaultVisualizationFilter();
    expect(filter.time_range.start.getDate()).toBe(1);
  });

  it('time_range.end is the last day of the month', () => {
    const filter = defaultVisualizationFilter();
    const lastDay = new Date(
      filter.time_range.end.getFullYear(),
      filter.time_range.end.getMonth() + 1,
      0,
    );
    expect(filter.time_range.end.getDate()).toBe(lastDay.getDate());
  });
});

describe('VisualizationFilter type', () => {
  it('allows creating a valid filter object', () => {
    const filter: VisualizationFilter = {
      time_range: {
        start: new Date('2026-01-01'),
        end: new Date('2026-01-31'),
        preset: TimePreset.month,
      },
      person_ids: ['person-uuid-1'],
      category_ids: [],
      account_ids: [],
      currency_mode: CurrencyMode.converted,
      display_currency: 'EUR',
      transaction_type: TransactionType.outflow,
      comparison_mode: ComparisonMode.persons,
      comparison_ids: ['person-uuid-1', 'person-uuid-2'],
      comparison_group_by: ComparisonGroupBy.category,
    };

    expect(filter.time_range.preset).toBe('month');
    expect(filter.currency_mode).toBe('converted');
    expect(filter.comparison_mode).toBe('persons');
    expect(filter.person_ids).toHaveLength(1);
  });
});

describe('TimeRange type', () => {
  it('allows creating a valid time range', () => {
    const timeRange: TimeRange = {
      start: new Date('2026-03-01'),
      end: new Date('2026-03-31'),
      preset: TimePreset.quarter,
    };

    expect(timeRange.preset).toBe('quarter');
    expect(timeRange.start).toBeInstanceOf(Date);
    expect(timeRange.end).toBeInstanceOf(Date);
  });
});
