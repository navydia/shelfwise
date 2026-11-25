import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { sizeSummary, lineDetail, pickDefaultSize } from '../public/lib/sizes.js';

const size = (o: any = {}) => ({ id: 1, name: '', soldBy: 'each', lastPriceCents: null, usualAmount: 1, isDefault: true, ...o });

describe('sizes', () => {
  it('sizeSummary_cases', () => {
    expect(sizeSummary({ sizes: [size({ lastPriceCents: 649 })] })).toBe('$6.49');
    expect(sizeSummary({ sizes: [size()] })).toBe('No price yet');
    expect(sizeSummary({ sizes: [size({ name: '5 oz can', lastPriceCents: 159 })] })).toBe('5 oz can · $1.59');
    expect(sizeSummary({ sizes: [size({ name: '5 oz can' })] })).toBe('5 oz can · No price yet');
    expect(sizeSummary({ sizes: [size({ soldBy: 'weight', lastPriceCents: 249 })] })).toBe('$2.49/lb');
    expect(sizeSummary({ sizes: [size({ id: 1, name: 'A', lastPriceCents: 579 }), size({ id: 2, name: 'B', lastPriceCents: 499, isDefault: false }), size({ id: 3, name: 'C', isDefault: false })] })).toBe('3 sizes · from $4.99');
    expect(sizeSummary({ sizes: [size({ name: 'A' }), size({ id: 2, name: 'B', isDefault: false })] })).toBe('2 sizes');
    expect(sizeSummary({ sizes: [] })).toBe('No price yet');
  });

  it('lineDetail_each_and_weight', () => {
    expect(lineDetail({ soldBy: 'each', amount: 1, unitPriceCents: 649 })).toBe('1 × $6.49');
    expect(lineDetail({ soldBy: 'each', amount: 3, unitPriceCents: 100 })).toBe('3 × $1.00');
    expect(lineDetail({ soldBy: 'weight', amount: 3, unitPriceCents: 249 })).toBe('About 3 lb × $2.49/lb');
    expect(lineDetail({ soldBy: 'weight', amount: 1.5, unitPriceCents: 249 })).toBe('About 1.5 lb × $2.49/lb');
    expect(lineDetail({ soldBy: 'each', amount: 1, unitPriceCents: null })).toBe('No price yet · not counted');
  });

  it('pickDefaultSize_prefers_last_then_default', () => {
    const a = size({ id: 1, name: 'A', isDefault: true });
    const b = size({ id: 2, name: 'B', isDefault: false });
    const c = size({ id: 3, name: 'C', isDefault: false });
    expect(pickDefaultSize({ sizes: [a, b, c], listSizeId: 3 })).toBe(c);
    expect(pickDefaultSize({ sizes: [a, b, c], listSizeId: null })).toBe(a);
    expect(pickDefaultSize({ sizes: [a, b, c], listSizeId: 99 })).toBe(a);
    expect(pickDefaultSize({ sizes: [b, c], listSizeId: null })).toBe(b);
  });
});
