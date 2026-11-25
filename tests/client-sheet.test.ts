import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { keyboardMetrics } from '../public/ui/sheet.js';

describe('sheet keyboard avoidance', () => {
  it('no_keyboard_means_no_offset', () => {
    expect(keyboardMetrics(800, { height: 800, offsetTop: 0 }).inset).toBe(0);
    expect(keyboardMetrics(800, null)).toEqual({ inset: 0, maxHeight: 736 });
  });
  it('keyboard_lifts_the_sheet_and_caps_its_height', () => {
    const m = keyboardMetrics(800, { height: 500, offsetTop: 0 });
    expect(m.inset).toBe(300);
    expect(m.maxHeight).toBe(488);
  });
  it('page_scrolled_by_the_keyboard_is_subtracted', () => {
    expect(keyboardMetrics(800, { height: 500, offsetTop: 120 }).inset).toBe(180);
  });
});

// @ts-ignore plain JS module
import { nextTabTarget } from '../public/ui/sheet.js';

describe('sheet focus trap', () => {
  const container: any = { contains: (n: any) => n === container || [a, b, c].includes(n) };
  const a = {}, b = {}, c = {};
  const items = [a, b, c];
  it('shift_tab_from_the_container_wraps_to_the_last_control', () => {
    expect(nextTabTarget(items, container, true, container)).toBe(c);
  });
  it('tab_from_the_container_moves_into_the_sheet', () => {
    expect(nextTabTarget(items, container, false, container)).toBe(a);
  });
  it('wraps_at_the_ends_and_leaves_the_middle_alone', () => {
    expect(nextTabTarget(items, a, true, container)).toBe(c);
    expect(nextTabTarget(items, c, false, container)).toBe(a);
    expect(nextTabTarget(items, b, false, container)).toBeNull();
    expect(nextTabTarget(items, b, true, container)).toBeNull();
  });
  it('focus_outside_the_sheet_is_pulled_back_in', () => {
    expect(nextTabTarget(items, {}, false, container)).toBe(a);
  });
});
