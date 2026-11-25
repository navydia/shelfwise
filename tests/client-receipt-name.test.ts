import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { guessName } from '../public/lib/receipt-name.js';

describe('receipt name guess', () => {
  it('guessName_strips_counts_sizes_price', () => {
    expect(guessName('Gm 1ct StarKist 25% Less Sodium Light Tuna in Water $1.59')).toBe('StarKist 25% Less Sodium Light Tuna in Water');
    expect(guessName('1ct Oroweat 100% Whole Wheat Bread, 24oz')).toBe('Oroweat 100% Whole Wheat Bread');
    expect(guessName('1ct Hannaford Mixed Vegetables')).toBe('Hannaford Mixed Vegetables');
  });
  it('guessName_title_cases_and_handles_sizes_with_spaces', () => {
    expect(guessName('2 ORGANIC WHOLE MILK 5 oz 3.49 F')).toBe('Organic Whole Milk');
    expect(guessName('banana 1.5 lb')).toBe('Banana');
  });
  it('guessName_never_returns_empty_for_text', () => {
    expect(guessName('  1ct  ')).toBe('1ct');
    expect(guessName('')).toBe('');
  });
});
