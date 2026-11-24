import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { compareAisles, groupList } from '../public/lib/list-groups.js';

const cats = [{ id: 1, name: 'Produce' }, { id: 2, name: 'Dairy & eggs' }];
const line = (id: number, name: string, aisle: string | null, categoryId: number | null = null) => ({ id, name, aisle, categoryId });

describe('list groups', () => {
  it('compareAisles_numbers_then_text_then_null', () => {
    const arr = ['Deli', '10', null, '2', 'bakery'];
    arr.sort(compareAisles);
    expect(arr).toEqual(['2', '10', 'bakery', 'Deli', null]);
  });

  it('group_by_aisle_titles_only_aisle', () => {
    const g = groupList([line(1, 'b', '4'), line(2, 'a', '4'), line(3, 'c', null), line(4, 'd', '2')], 'aisle', cats, new Set(), false);
    expect(g.map((x: any) => x.title)).toEqual(['Aisle 2', 'Aisle 4', 'No aisle']);
    expect(g[1].items.map((i: any) => i.name)).toEqual(['a', 'b']);
  });

  it('group_by_category_titles_only_category', () => {
    const g = groupList([line(1, 'x', '1', 2), line(2, 'y', '1', null), line(3, 'z', '1', 1)], 'category', cats, new Set(), false);
    expect(g.map((x: any) => x.title)).toEqual(['Produce', 'Dairy & eggs', 'No category']);
  });

  it('none_gives_single_untitled_group', () => {
    const g = groupList([line(1, 'b', '1'), line(2, 'a', '2')], 'none', cats, new Set(), false);
    expect(g).toHaveLength(1);
    expect(g[0].title).toBeNull();
    expect(g[0].items.map((i: any) => i.name)).toEqual(['a', 'b']);
  });

  it('ticked_move_to_cart_group', () => {
    const lines = [line(1, 'a', '1'), line(2, 'b', '1'), line(3, 'c', '2')];
    const g = groupList(lines, 'aisle', cats, new Set([3, 2]), true);
    expect(g.map((x: any) => x.title)).toEqual(['Aisle 1', 'In the cart']);
    expect(g[0].items.map((i: any) => i.id)).toEqual([1]);
    expect(g[1].key).toBe('cart');
    expect(g[1].items.map((i: any) => i.name)).toEqual(['b', 'c']);
    const g2 = groupList(lines, 'aisle', cats, new Set([3]), false);
    expect(g2.map((x: any) => x.title)).toEqual(['Aisle 1', 'Aisle 2']);
  });
});
