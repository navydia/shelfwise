import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { createTrips } from '../public/lib/trip.js';

function mem(initial: Record<string, unknown> = {}) {
  const m = new Map<string, unknown>(Object.entries(initial));
  return {
    get: (k: string, fb: unknown) => (m.has(k) ? m.get(k) : fb),
    set: (k: string, v: unknown) => { if (v === undefined) m.delete(k); else m.set(k, v); },
    remove: (k: string) => { m.delete(k); },
    has: (k: string) => m.has(k),
  };
}

describe('trips', () => {
  it('toggle_sets_and_clears_startedAt', () => {
    const t = createTrips(mem(), () => new Date(2026, 0, 5, 10, 0));
    expect(t.get(1)).toEqual({ ids: [], startedAt: null });
    const a = t.toggle(1, 7);
    expect(a.ids).toEqual([7]);
    expect(a.startedAt).toBe(new Date(2026, 0, 5, 10, 0).toISOString());
    expect(t.toggle(1, 8).startedAt).toBe(a.startedAt);
    t.toggle(1, 7);
    expect(t.toggle(1, 8)).toEqual({ ids: [], startedAt: null });
    expect(t.get(1)).toEqual({ ids: [], startedAt: null });
  });
  it('remove_drops_ids_from_every_trip', () => {
    const t = createTrips(mem(), () => new Date(2026, 0, 5, 10, 0));
    t.toggle(1, 1); t.toggle(1, 2); t.toggle(2, 2); t.toggle(3, 2);
    t.remove([2], [1, 2]);
    expect(t.get(1).ids).toEqual([1]);
    expect(t.get(2)).toEqual({ ids: [], startedAt: null });
    expect(t.get(3).ids).toEqual([2]);
    t.clear(1);
    expect(t.get(1)).toEqual({ ids: [], startedAt: null });
  });
  it('stale_uses_local_calendar_day', () => {
    let now = new Date(2026, 0, 5, 23, 59);
    const t = createTrips(mem(), () => now);
    now = new Date(2026, 0, 5, 23, 58);
    t.toggle(1, 1);
    now = new Date(2026, 0, 5, 23, 59);
    expect(t.stale([1])).toEqual([]);
    now = new Date(2026, 0, 6, 0, 5);
    expect(t.stale([1, 2])).toEqual([{ storeId: 1, startedAt: new Date(2026, 0, 5, 23, 58).toISOString(), count: 1 }]);
  });
  it('dropLegacy_removes_sw_checked', () => {
    const s = mem({ 'sw-checked': [1, 2] });
    createTrips(s).dropLegacy();
    expect(s.has('sw-checked')).toBe(false);
  });
});
