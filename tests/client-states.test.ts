import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { COMMON_STAPLES, remainingCommonStaples, listState, pantryEmptyKind, describeFilters, listMeta } from '../public/lib/screen-states.js';

describe('screen states', () => {
  it('remainingCommonStaples_hides_existing_case_insensitive', () => {
    expect(remainingCommonStaples([{ name: ' milk ' }, { name: 'EGGS' }])).toEqual(['Bread', 'Butter', 'Bananas']);
    expect(remainingCommonStaples([])).toEqual(COMMON_STAPLES);
  });
  it('listState_cases', () => {
    expect(listState(0, 0)).toBe('empty');
    expect(listState(0, 3)).toBe('allTicked');
    expect(listState(2, 0)).toBe('normal');
    expect(listState(2, 3)).toBe('normal');
  });
  it('search_with_hidden_match_shows_filter_state', () => {
    expect(pantryEmptyKind({ totalInScope: 5, shown: 0, query: 'oat', activeFilters: 2, queryMatchesIgnoringFilters: 1 })).toBe('noFilterMatch');
  });
  it('pantryEmptyKind_search_beats_filters', () => {
    expect(pantryEmptyKind({ totalInScope: 5, shown: 0, query: 'oat', activeFilters: 2, queryMatchesIgnoringFilters: 0 })).toBe('noSearchMatch');
    expect(pantryEmptyKind({ totalInScope: 0, shown: 0, query: '', activeFilters: 0 })).toBe('noStaples');
    expect(pantryEmptyKind({ totalInScope: 5, shown: 0, query: '  ', activeFilters: 1 })).toBe('noFilterMatch');
    expect(pantryEmptyKind({ totalInScope: 5, shown: 2, query: 'oat', activeFilters: 1 })).toBeNull();
  });
  it('describeFilters_sentences', () => {
    const cats = [{ id: 1, name: 'Frozen' }, { id: 2, name: 'Produce' }];
    expect(describeFilters({ show: 'onList', categoryId: 1, noPhoto: false }, cats)).toBe('No staples on your list in Frozen.');
    expect(describeFilters({ show: 'all', categoryId: null, noPhoto: true }, cats)).toBe('No staples without a photo.');
    expect(describeFilters({ show: 'onList', categoryId: 2, noPhoto: true }, cats)).toBe('No staples on your list in Produce without a photo.');
  });
  it('listMeta_formats', () => {
    expect(listMeta(4, 0)).toBe('4 to get');
    expect(listMeta(4, 2)).toBe('4 to get · 2 in the cart');
    expect(listMeta(1, 1)).toBe('1 to get · 1 in the cart');
  });
});
