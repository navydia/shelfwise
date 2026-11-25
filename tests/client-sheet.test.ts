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
