import { describe, it, expect } from 'vitest';
import { parseDollars as serverParse } from '../src/lib/money';
// @ts-ignore plain JS module
import { parseDollars, fmt, priceParts } from '../public/lib/money.js';
// @ts-ignore plain JS module
import { budgetTag } from '../public/lib/budget-tag.js';

describe('client money', () => {
  it('parseDollars_matches_server', () => {
    for (const s of ['4', '4.5', '$4.50', '', 'abc', '-3', '4.555', ' 12.30 ']) {
      expect(parseDollars(s)).toBe(serverParse(s));
    }
  });
  it('fmt formats cents', () => {
    expect(fmt(429)).toBe('$4.29');
    expect(fmt(5)).toBe('$0.05');
  });
  it('priceParts_pads_cents', () => {
    expect(priceParts(399)).toEqual({ dollars: '3', cents: '99' });
    expect(priceParts(405)).toEqual({ dollars: '4', cents: '05' });
    expect(priceParts(500)).toEqual({ dollars: '5', cents: '00' });
  });
  it('budgetTag_none_under_near_over', () => {
    expect(budgetTag({ subtotalCents: 1234, budgetCents: null, status: 'none' })).toEqual({
      variant: 'none', bigCents: 1234, label: 'Estimated', detail: 'Tap to set a budget' });
    expect(budgetTag({ subtotalCents: 1340, budgetCents: 7500, status: 'under' })).toEqual({
      variant: 'under', bigCents: 6160, label: 'Left to spend', detail: '$13.40 of $75.00' });
    expect(budgetTag({ subtotalCents: 1340, budgetCents: 1500, status: 'near' })).toEqual({
      variant: 'near', bigCents: 160, label: 'Left to spend', detail: '$13.40 of $15.00' });
    expect(budgetTag({ subtotalCents: 8000, budgetCents: 7500, status: 'over' })).toEqual({
      variant: 'over', bigCents: 500, label: 'Over budget', detail: '$80.00 of $75.00' });
  });
});
