import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { pantryView } from '../public/lib/pantry-view.js';

const stores = [{ id: 1, name: 'Main', color: '#4A3242' }, { id: 2, name: 'Corner', color: '#22434A' }];
const categories = [{ id: 1, name: 'Produce' }, { id: 2, name: 'Dairy & eggs' }];
const it_ = (id: number, name: string, o: any = {}) => ({
  id, name, storeId: 1, onList: false, photo: 'p.jpg', categoryId: null, aisle: null, changedAt: '2026-01-01T00:00:00.000Z', ...o,
});
const base = { query: '', show: 'all', categoryId: null, noPhoto: false, sort: 'store' };
const ctx = { stores, categories, storeId: null };

describe('pantryView', () => {
  it('query_forces_flat_sorted_by_name', () => {
    const v = pantryView([it_(1, 'Zucchini'), it_(2, 'apple'), it_(3, 'Banana'), it_(4, 'Zesty apple')], { ...base, query: 'APP' }, ctx);
    expect(v.mode).toBe('flat');
    expect(v.sections).toHaveLength(1);
    expect(v.sections[0].items.map((i: any) => i.name)).toEqual(['apple', 'Zesty apple']);
    expect(v.shown).toBe(2);
    expect(v.total).toBe(4);
  });

  it('store_sort_sections_follow_store_order_with_colour', () => {
    const v = pantryView([it_(1, 'b', { storeId: 2 }), it_(2, 'z'), it_(3, 'a')], base, ctx);
    expect(v.mode).toBe('stores');
    expect(v.sections.map((s: any) => [s.title, s.color])).toEqual([['Main', '#4A3242'], ['Corner', '#22434A']]);
    expect(v.sections[0].items.map((i: any) => i.name)).toEqual(['a', 'z']);
  });

  it('single_store_store_sort_falls_back_to_aisle', () => {
    const v = pantryView([it_(1, 'a', { aisle: '3' }), it_(2, 'b')], base, { ...ctx, storeId: 1 });
    expect(v.mode).toBe('groups');
    expect(v.sections.map((s: any) => s.title)).toEqual(['Aisle 3', 'No aisle']);
  });

  it('category_sort_groups', () => {
    const v = pantryView([it_(1, 'a', { categoryId: 2 }), it_(2, 'b')], { ...base, sort: 'category' }, ctx);
    expect(v.mode).toBe('groups');
    expect(v.sections.map((s: any) => s.title)).toEqual(['Dairy & eggs', 'No category']);
  });

  it('filters_and_active_count', () => {
    const items = [
      it_(1, 'a', { onList: true, categoryId: 1, photo: null }),
      it_(2, 'b', { onList: true, categoryId: 1 }),
      it_(3, 'c', { categoryId: 1, photo: null }),
      it_(4, 'd', { onList: true, categoryId: 2, photo: null }),
    ];
    const v = pantryView(items, { ...base, sort: 'name', show: 'onList', categoryId: 1, noPhoto: true }, ctx);
    expect(v.sections[0].items.map((i: any) => i.id)).toEqual([1]);
    expect(v.activeFilters).toBe(3);
    expect(v.total).toBe(4);
    expect(v.shown).toBe(1);
    expect(pantryView(items, { ...base, sort: 'name' }, ctx).activeFilters).toBe(0);
    const s = pantryView([it_(1, 'a'), it_(2, 'b', { storeId: 2 })], { ...base, sort: 'name' }, { ...ctx, storeId: 2 });
    expect(s.sections[0].items.map((i: any) => i.id)).toEqual([2]);
  });

  it('recent_sorts_newest_first', () => {
    const v = pantryView([
      it_(1, 'a', { changedAt: '2026-01-01T00:00:00.000Z' }),
      it_(2, 'b', { changedAt: '2026-03-01T00:00:00.000Z' }),
      it_(3, 'c', { changedAt: '2026-02-01T00:00:00.000Z' }),
    ], { ...base, sort: 'recent' }, ctx);
    expect(v.mode).toBe('flat');
    expect(v.sections[0].items.map((i: any) => i.id)).toEqual([2, 3, 1]);
  });

  it('archived_staples_never_show', () => {
    const v = pantryView([it_(1, 'a'), it_(2, 'b', { archived: true })], { ...base, sort: 'name' }, ctx);
    expect(v.sections[0].items.map((i: any) => i.id)).toEqual([1]);
    expect(pantryView([it_(1, 'a'), it_(2, 'ab', { archived: true })], { ...base, query: 'a' }, ctx).shown).toBe(1);
  });
});
