import { describe, it, expect } from 'vitest';
import { parseReceiptText, normalizeLabel } from '../src/lib/receipt';

describe('receipt parsing', () => {
  it('parses_priced_lines', () => {
    expect(parseReceiptText('ORG BNNA 1.29\nOLIVE OIL  $9.49\nthank you for shopping')).toEqual([
      { raw: 'ORG BNNA 1.29', priceCents: 129 },
      { raw: 'OLIVE OIL  $9.49', priceCents: 949 },
    ]);
  });
  it('ignores_totals_tax_and_payment_lines', () => {
    const text = 'EGGS 3.99\nSUBTOTAL 3.99\nTAX 0.00\nTOTAL 3.99\nVISA 3.99\nCASH 5.00\nCHANGE 1.01\nBALANCE 0.00';
    expect(parseReceiptText(text)).toEqual([{ raw: 'EGGS 3.99', priceCents: 399 }]);
  });
  it('ignores_negative_discounts', () => {
    expect(parseReceiptText('RICE 4.00\nCOUPON 1.00-\nMEMBER SAVINGS -0.50')).toEqual([{ raw: 'RICE 4.00', priceCents: 400 }]);
  });
  it('handles_trailing_tax_flag', () => {
    expect(parseReceiptText('SOAP 2.99 T\nMILK 3.49F')).toEqual([
      { raw: 'SOAP 2.99 T', priceCents: 299 },
      { raw: 'MILK 3.49F', priceCents: 349 },
    ]);
  });
  it('normalizes_labels', () => {
    expect(normalizeLabel('ORG  BNNA 1.29 F')).toBe('org bnna');
    expect(normalizeLabel("Trader Joe's  Rice $3.00")).toBe('trader joe s rice');
  });
});
