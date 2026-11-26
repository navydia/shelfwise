import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { parseWeight, validateDraft, newStapleBody, draftFromLine, willUpdatePrice, planSave, buildMatches, resultSummary, runSave } from '../public/lib/receipt-save.js';

const line = (id: number, raw = 'x', priceCents = 100) => ({ id, raw, priceCents });
const itemState = (id: number, itemId: number, sizeId: number, soldBy = 'each', weightText = '') =>
  ({ line: line(id, `line ${id}`), choice: { itemId, sizeId, soldBy }, skipped: false, weightText });
const newState = (id: number, draft: any) => ({ line: line(id, `line ${id}`), choice: { pending: draft }, skipped: false, weightText: '' });

describe('parseWeight', () => {
  it('blank_is_no_weight', () => { expect(parseWeight('')).toEqual({ ok: true, lb: null }); expect(parseWeight('  ')).toEqual({ ok: true, lb: null }); });
  it('positive_numbers', () => { expect(parseWeight('2.5')).toEqual({ ok: true, lb: 2.5 }); expect(parseWeight('3 lb')).toEqual({ ok: true, lb: 3 }); expect(parseWeight('.75')).toEqual({ ok: true, lb: 0.75 }); });
  it('rejects_zero_and_junk', () => { for (const t of ['0', '-1', 'abc', '1.2.3', '2 kg']) expect(parseWeight(t).ok).toBe(false); });
});

describe('new staple draft', () => {
  it('draft_from_line_guesses_name_and_price', () => {
    const d = draftFromLine({ raw: '1ct Oroweat 100% Whole Wheat Bread, 24oz', priceCents: 544 });
    expect(d.name).toMatch(/Oroweat/);
    expect(d).toMatchObject({ sizeName: '', soldBy: 'each', priceText: '5.44' });
  });
  it('validate_needs_a_name', () => { expect(validateDraft({ name: ' ', priceText: '1.00', soldBy: 'each' }, []).ok).toBe(false); });
  it('validate_rejects_taken_names_ignoring_case', () => {
    const r = validateDraft({ name: 'milk', priceText: '', soldBy: 'each' }, ['Milk']);
    expect(r.ok).toBe(false); expect(r.error).toMatch(/already/i);
  });
  it('validate_rejects_bad_price_and_allows_blank', () => {
    expect(validateDraft({ name: 'Tuna', priceText: 'abc', soldBy: 'each' }, []).ok).toBe(false);
    expect(validateDraft({ name: 'Tuna', priceText: '', soldBy: 'each' }, [])).toMatchObject({ ok: true, priceCents: null });
    expect(validateDraft({ name: 'Tuna', priceText: '1.59', soldBy: 'each' }, [])).toMatchObject({ ok: true, priceCents: 159 });
  });
  it('body_has_one_default_size', () => {
    const b = newStapleBody({ name: ' Light tuna ', sizeName: '5 oz can', soldBy: 'each', priceText: '1.59', categoryId: 3 }, 7);
    expect(b).toEqual({ name: 'Light tuna', storeId: 7, categoryId: 3, sizes: [{ name: '5 oz can', soldBy: 'each', lastPriceCents: 159, usualAmount: 1, isDefault: true }] });
  });
  it('body_without_category', () => {
    const b = newStapleBody({ name: 'Tuna', sizeName: '', soldBy: 'weight', priceText: '', categoryId: null }, 1);
    expect(b.categoryId).toBeUndefined();
    expect(b.sizes[0]).toMatchObject({ soldBy: 'weight', lastPriceCents: null });
  });
});

describe('weight and price', () => {
  it('each_always_updates', () => { expect(willUpdatePrice(itemState(1, 1, 1))).toBe(true); });
  it('weight_without_weight_keeps_price', () => {
    expect(willUpdatePrice(itemState(1, 1, 1, 'weight', ''))).toBe(false);
    expect(willUpdatePrice(itemState(1, 1, 1, 'weight', 'oops'))).toBe(false);
  });
  it('weight_with_weight_updates', () => { expect(willUpdatePrice(itemState(1, 1, 1, 'weight', '2.5'))).toBe(true); });
});

describe('planSave', () => {
  it('lists_pending_creates_in_order', () => {
    const a = newState(1, { name: 'A' }); const b = newState(2, { name: 'B' });
    const p = planSave([a, itemState(3, 9, 9), b]);
    expect(p.error).toBeUndefined();
    expect(p.creates.map((s: any) => s.line.id)).toEqual([1, 2]);
  });
  it('blocks_two_lines_on_one_item', () => {
    expect(planSave([itemState(1, 5, 1), itemState(2, 5, 1)]).error).toMatch(/same item/i);
  });
  it('blocks_a_bad_weight', () => { expect(planSave([itemState(1, 5, 1, 'weight', 'zz')]).error).toMatch(/weight/i); });
  it('skipped_and_unmatched_ignored', () => {
    const s = { line: line(1), choice: null, skipped: true, weightText: '' };
    expect(planSave([s, { ...s, skipped: false }]).creates).toEqual([]);
  });
});

describe('buildMatches', () => {
  it('sends_size_and_weight', () => {
    const m = buildMatches([itemState(1, 5, 11), itemState(2, 6, 12, 'weight', '2.5'), itemState(3, 7, 13, 'weight', ''), { line: line(4), choice: null, skipped: false, weightText: '' }]);
    expect(m).toEqual([
      { lineId: 1, itemId: 5, sizeId: 11 },
      { lineId: 2, itemId: 6, sizeId: 12, weightLb: 2.5 },
      { lineId: 3, itemId: 7, sizeId: 13 },
    ]);
  });
});

describe('resultSummary', () => {
  it('splits_updated_and_kept', () => {
    const r = resultSummary([itemState(1, 5, 11), itemState(2, 6, 12, 'weight', ''), itemState(3, 7, 13, 'weight', '1.5')]);
    expect(r.updated).toBe(2);
    expect(r.kept.map((s: any) => s.line.id)).toEqual([2]);
  });
});

describe('weight staples never take the line total as a per-lb price', () => {
  it('weight_body_has_no_price', () => {
    const b = newStapleBody({ name: 'Grapes', sizeName: '', soldBy: 'weight', priceText: '4.99', categoryId: null }, 1);
    expect(b.sizes[0].lastPriceCents).toBeNull();
  });
  it('each_body_keeps_line_total', () => {
    expect(newStapleBody({ name: 'Bread', sizeName: '', soldBy: 'each', priceText: '5.44', categoryId: null }, 1).sizes[0].lastPriceCents).toBe(544);
  });
  it('weight_draft_validates_without_a_price', () => {
    expect(validateDraft({ name: 'Grapes', priceText: 'junk', soldBy: 'weight' }, []).ok).toBe(true);
  });
});

describe('runSave', () => {
  const made = (id: number) => ({ id, sizes: [{ id: id * 10, soldBy: 'each' }] });
  it('creates_then_confirms', async () => {
    const calls: string[] = [];
    const states = [newState(1, { name: 'A', soldBy: 'each', priceText: '1.00' }), itemState(2, 9, 90)];
    const r = await runSave(states, { storeId: 1, api: { createItem: async (b: any) => { calls.push('create ' + b.name); return made(5); }, confirm: async (m: any) => { calls.push('confirm ' + m.length); } } });
    expect(r).toEqual({ ok: true, made: 1 });
    expect(calls).toEqual(['create A', 'confirm 2']);
  });
  it('failed_create_confirms_nothing_and_retry_does_not_duplicate', async () => {
    const created: string[] = []; let confirms = 0; let failB = true;
    const createItem = async (b: any) => {
      if (b.name === 'B' && failB) throw Object.assign(new Error('taken'), { status: 409, data: { archivedId: 77 } });
      created.push(b.name); return made(created.length);
    };
    const api = { createItem, confirm: async () => { confirms++; } };
    const states = [newState(1, { name: 'A', soldBy: 'each', priceText: '' }), newState(2, { name: 'B', soldBy: 'each', priceText: '' })];
    const r1 = await runSave(states, { storeId: 1, api });
    expect(r1).toMatchObject({ ok: false, stage: 'create', name: 'B', made: 1 });
    expect(confirms).toBe(0);
    expect((states[1] as any).archivedId).toBe(77);
    failB = false;
    const r2 = await runSave(states, { storeId: 1, api });
    expect(r2.ok).toBe(true);
    expect(created).toEqual(['A', 'B']);
    expect(confirms).toBe(1);
  });
  it('confirm_failure_keeps_created_staples_matched', async () => {
    const states = [newState(1, { name: 'A', soldBy: 'each', priceText: '' })];
    const r = await runSave(states, { storeId: 1, api: { createItem: async () => made(3), confirm: async () => { throw new Error('offline'); } } });
    expect(r).toMatchObject({ ok: false, stage: 'confirm', made: 1 });
    expect((states[0] as any).choice.itemId).toBe(3);
  });
  describe('typed price survives confirm', () => {
    const run = async (draft: any, patchSize: any, lineCents = 598) => {
      const st = [{ ...newState(1, draft), line: line(1, 'l', lineCents) }];
      return runSave(st, { storeId: 1, api: { createItem: async () => made(5), confirm: async () => {}, patchSize } });
    };
    it('typed_equal_to_line_price_sends_no_patch', async () => {
      const calls: any[] = [];
      await run({ name: 'A', soldBy: 'each', priceText: '5.98' }, async (id: number, p: any) => { calls.push([id, p]); });
      expect(calls).toEqual([]);
    });
    it('typed_different_price_is_patched_after_confirm', async () => {
      const calls: any[] = [];
      const r = await run({ name: 'A', soldBy: 'each', priceText: '2.99' }, async (id: number, p: any) => { calls.push([id, p]); });
      expect(calls).toEqual([[50, { lastPriceCents: 299 }]]);
      expect(r).toEqual({ ok: true, made: 1 });
    });
    it('blank_typed_price_patches_null', async () => {
      const calls: any[] = [];
      await run({ name: 'A', soldBy: 'each', priceText: '' }, async (id: number, p: any) => { calls.push([id, p]); });
      expect(calls).toEqual([[50, { lastPriceCents: null }]]);
    });
    it('weight_drafts_are_never_patched', async () => {
      const calls: any[] = [];
      await run({ name: 'A', soldBy: 'weight', priceText: '' }, async (id: number, p: any) => { calls.push([id, p]); });
      expect(calls).toEqual([]);
    });
    it('failed_patch_is_reported_by_name', async () => {
      const r: any = await run({ name: 'Eggs', soldBy: 'each', priceText: '2.99' }, async () => { throw new Error('x'); });
      expect(r.ok).toBe(true);
      expect(r.priceFailed).toEqual(['Eggs']);
    });
  });
});
