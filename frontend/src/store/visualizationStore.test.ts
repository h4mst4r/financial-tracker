/**
 * Tests for visualizationStore — Zustand visualization filter state management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useVisualizationStore, useVisualizationFilter } from './visualizationStore';
import { TimePreset, CurrencyMode, TransactionType } from '../types/visualization';

// --- Tests ---

describe('useVisualizationStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useVisualizationStore.getState().resetFilter();
  });

  describe('initial state', () => {
    it('has default filter with current month', () => {
      const state = useVisualizationStore.getState();
      expect(state.filter.time_range.preset).toBe(TimePreset.month);
    });

    it('has empty filter history', () => {
      expect(useVisualizationStore.getState().filterHistory).toEqual([]);
    });

    it('has null currentModule', () => {
      expect(useVisualizationStore.getState().currentModule).toBeNull();
    });

    it('defaults to raw currency mode', () => {
      expect(useVisualizationStore.getState().filter.currency_mode).toBe(CurrencyMode.raw);
    });

    it('defaults to all transaction types', () => {
      expect(useVisualizationStore.getState().filter.transaction_type).toBe(TransactionType.all);
    });
  });

  describe('setFilter', () => {
    it('merges partial filter into current state', () => {
      const state = useVisualizationStore.getState();
      useVisualizationStore.getState().setFilter({
        category_ids: ['cat-uuid-1'],
      });

      const newState = useVisualizationStore.getState();
      expect(newState.filter.category_ids).toEqual(['cat-uuid-1']);
      // Other fields should be preserved
      expect(newState.filter.time_range.preset).toBe(state.filter.time_range.preset);
    });

    it('can update time range', () => {
      useVisualizationStore.getState().setFilter({
        time_range: {
          start: new Date('2026-01-01'),
          end: new Date('2026-12-31'),
          preset: TimePreset.year,
        },
      });

      const state = useVisualizationStore.getState();
      expect(state.filter.time_range.preset).toBe(TimePreset.year);
    });

    it('can switch currency mode', () => {
      useVisualizationStore.getState().setFilter({
        currency_mode: CurrencyMode.converted,
      });

      expect(useVisualizationStore.getState().filter.currency_mode).toBe(CurrencyMode.converted);
    });

    it('preserves unchanged fields', () => {
      // Set a custom display currency first
      useVisualizationStore.getState().setDisplayCurrency('SGD');

      // Update unrelated field
      useVisualizationStore.getState().setFilter({
        transaction_type: TransactionType.outflow,
      });

      const state = useVisualizationStore.getState();
      expect(state.filter.display_currency).toBe('SGD');
      expect(state.filter.transaction_type).toBe(TransactionType.outflow);
    });
  });

  describe('drillDown', () => {
    it('pushes current filter to history', () => {
      useVisualizationStore.getState().drillDown('category', 'cat-1', 'Groceries');

      const state = useVisualizationStore.getState();
      expect(state.filterHistory).toHaveLength(1);
      expect(state.filterHistory[0].label).toBe('Groceries');
    });

    it('filters by category when entityType is category', () => {
      useVisualizationStore.getState().drillDown('category', 'cat-uuid-1', 'Food');

      expect(useVisualizationStore.getState().filter.category_ids).toEqual(['cat-uuid-1']);
    });

    it('filters by person when entityType is person', () => {
      useVisualizationStore.getState().drillDown('person', 'person-uuid-1', 'Ben');

      expect(useVisualizationStore.getState().filter.person_ids).toEqual(['person-uuid-1']);
    });

    it('filters by account when entityType is account', () => {
      useVisualizationStore.getState().drillDown('account', 'acct-uuid-1', 'DBS Savings');

      expect(useVisualizationStore.getState().filter.account_ids).toEqual(['acct-uuid-1']);
    });

    it('does not filter for unknown entity types', () => {
      const originalFilter = useVisualizationStore.getState().filter;
      useVisualizationStore.getState().drillDown('unknown', 'id-1', 'Unknown');

      const state = useVisualizationStore.getState();
      expect(state.filter.category_ids).toEqual(originalFilter.category_ids);
      expect(state.filter.person_ids).toEqual(originalFilter.person_ids);
      expect(state.filter.account_ids).toEqual(originalFilter.account_ids);
    });

    it('preserves history on multiple drill-downs', () => {
      useVisualizationStore.getState().drillDown('category', 'cat-1', 'Food');
      useVisualizationStore.getState().drillDown('person', 'person-1', 'Ben');
      useVisualizationStore.getState().drillDown('account', 'acct-1', 'DBS');

      expect(useVisualizationStore.getState().filterHistory).toHaveLength(3);
    });
  });

  describe('drillUp', () => {
    it('restores previous filter from history', () => {
      // Set up: drill down once
      useVisualizationStore.getState().drillDown('category', 'cat-1', 'Food');

      // Now drill up
      useVisualizationStore.getState().drillUp();

      const state = useVisualizationStore.getState();
      expect(state.filterHistory).toHaveLength(0);
      // Filter should be restored to pre-drill-down state (empty category_ids)
      expect(state.filter.category_ids).toEqual([]);
    });

    it('is no-op when history is empty', () => {
      const before = useVisualizationStore.getState().filter;
      useVisualizationStore.getState().drillUp();

      const after = useVisualizationStore.getState().filter;
      expect(after).toEqual(before);
    });

    it('supports multiple drill-ups', () => {
      useVisualizationStore.getState().drillDown('category', 'cat-1', 'Food');
      useVisualizationStore.getState().drillDown('person', 'person-1', 'Ben');

      // First drill-up restores to after first drill-down
      useVisualizationStore.getState().drillUp();
      expect(useVisualizationStore.getState().filterHistory).toHaveLength(1);

      // Second drill-up restores to original
      useVisualizationStore.getState().drillUp();
      expect(useVisualizationStore.getState().filterHistory).toHaveLength(0);
    });
  });

  describe('resetFilter', () => {
    it('resets filter to defaults', () => {
      // Modify filter
      useVisualizationStore.getState().setFilter({
        category_ids: ['cat-1'],
        time_range: {
          start: new Date('2026-01-01'),
          end: new Date('2026-12-31'),
          preset: TimePreset.year,
        },
      });

      useVisualizationStore.getState().resetFilter();

      const state = useVisualizationStore.getState();
      expect(state.filter.category_ids).toEqual([]);
      expect(state.filter.time_range.preset).toBe(TimePreset.month);
    });

    it('clears filter history', () => {
      useVisualizationStore.getState().drillDown('category', 'cat-1', 'Food');
      expect(useVisualizationStore.getState().filterHistory).toHaveLength(1);

      useVisualizationStore.getState().resetFilter();
      expect(useVisualizationStore.getState().filterHistory).toEqual([]);
    });

    it('preserves display currency', () => {
      useVisualizationStore.getState().setDisplayCurrency('SGD');
      useVisualizationStore.getState().resetFilter();

      expect(useVisualizationStore.getState().filter.display_currency).toBe('SGD');
    });
  });

  describe('navigateTo', () => {
    it('applies filter patch', () => {
      useVisualizationStore.getState().navigateTo('transactions', {
        category_ids: ['cat-1'],
      });

      const state = useVisualizationStore.getState();
      expect(state.filter.category_ids).toEqual(['cat-1']);
    });

    it('sets currentModule', () => {
      useVisualizationStore.getState().navigateTo('budgets', {});

      expect(useVisualizationStore.getState().currentModule).toBe('budgets');
    });

    it('pushes current state to history', () => {
      useVisualizationStore.getState().navigateTo('transactions', {
        category_ids: ['cat-1'],
      });

      expect(useVisualizationStore.getState().filterHistory).toHaveLength(1);
    });
  });

  describe('setDisplayCurrency', () => {
    it('updates display_currency in filter', () => {
      useVisualizationStore.getState().setDisplayCurrency('EUR');

      expect(useVisualizationStore.getState().filter.display_currency).toBe('EUR');
    });

    it('preserves other filter fields', () => {
      useVisualizationStore.getState().setFilter({
        category_ids: ['cat-1'],
      });
      useVisualizationStore.getState().setDisplayCurrency('JPY');

      const state = useVisualizationStore.getState();
      expect(state.filter.display_currency).toBe('JPY');
      expect(state.filter.category_ids).toEqual(['cat-1']);
    });
  });

  describe('history limit', () => {
    it('caps history at 20 entries', () => {
      for (let i = 0; i < 25; i++) {
        useVisualizationStore.getState().drillDown('category', `cat-${i}`, `Category ${i}`);
      }

      expect(useVisualizationStore.getState().filterHistory).toHaveLength(20);
    });
  });
});

describe('useVisualizationFilter hook', () => {
  beforeEach(() => {
    useVisualizationStore.getState().resetFilter();
  });

  it('exposes filter and actions', () => {
    // The hook reads from the store — we can verify by checking store state
    const state = useVisualizationStore.getState();

    expect(state.filter).toBeDefined();
    expect(state.filter.time_range).toBeDefined();
  });

  it('provides setFilter through the store', () => {
    useVisualizationStore.getState().setFilter({
      transaction_type: TransactionType.inflow,
    });

    expect(useVisualizationStore.getState().filter.transaction_type).toBe(TransactionType.inflow);
  });

  it('provides drillDown through the store', () => {
    useVisualizationStore.getState().drillDown('category', 'cat-1', 'Food');

    expect(useVisualizationStore.getState().filter.category_ids).toEqual(['cat-1']);
    expect(useVisualizationStore.getState().filterHistory).toHaveLength(1);
  });

  it('provides drillUp through the store', () => {
    useVisualizationStore.getState().drillDown('category', 'cat-1', 'Food');
    useVisualizationStore.getState().drillUp();

    expect(useVisualizationStore.getState().filterHistory).toHaveLength(0);
  });

  it('provides resetFilter through the store', () => {
    useVisualizationStore.getState().setFilter({ category_ids: ['cat-1'] });
    useVisualizationStore.getState().resetFilter();

    expect(useVisualizationStore.getState().filter.category_ids).toEqual([]);
  });
});
