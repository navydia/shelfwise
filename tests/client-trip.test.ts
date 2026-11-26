import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { createTrips, lineKey, stapleKey, oneoffKey } from '../public/lib/trip.js';

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
    const a = t.toggle(1, 's:7');
    expect(a.ids).toEqual(['s:7']);
    expect(a.startedAt).toBe(new Date(2026, 0, 5, 10, 0).toISOString());
    expect(t.toggle(1, 's:8').startedAt).toBe(a.startedAt);
    t.toggle(1, 's:7');
    expect(t.toggle(1, 's:8')).toEqual({ ids: [], startedAt: null });
    expect(t.get(1)).toEqual({ ids: [], startedAt: null });
  });
  it('remove_drops_ids_from_every_trip', () => {
    const t = createTrips(mem(), () => new Date(2026, 0, 5, 10, 0));
    t.toggle(1, 's:1'); t.toggle(1, 's:2'); t.toggle(2, 's:2'); t.toggle(3, 's:2');
    t.remove(['s:2'], [1, 2]);
    expect(t.get(1).ids).toEqual(['s:1']);
    expect(t.get(2)).toEqual({ ids: [], startedAt: null });
    expect(t.get(3).ids).toEqual(['s:2']);
    t.clear(1);
    expect(t.get(1)).toEqual({ ids: [], startedAt: null });
  });
  it('stale_uses_local_calendar_day', () => {
    let now = new Date(2026, 0, 5, 23, 59);
    const t = createTrips(mem(), () => now);
    now = new Date(2026, 0, 5, 23, 58);
    t.toggle(1, 's:1');
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
  it('trip_string_keys_and_legacy_drop', () => {
    expect(stapleKey(7)).toBe('s:7');
    expect(oneoffKey(7)).toBe('o:7');
    expect(lineKey({ kind: 'oneoff', id: 3 })).toBe('o:3');
    expect(lineKey({ kind: 'staple', id: 3 })).toBe('s:3');
    expect(lineKey({ id: 3 })).toBe('s:3');
    const s = mem({ 'sw-trip-1': { ids: [4, 5], startedAt: '2026-01-05T10:00:00.000Z' }, 'sw-trip-2': { ids: [4, 's:9', 'o:2'], startedAt: '2026-01-05T10:00:00.000Z' } });
    const t = createTrips(s, () => new Date(2026, 0, 5, 10, 0));
    expect(t.get(1)).toEqual({ ids: [], startedAt: null }); // numeric ticks from before this version are dropped
    expect(t.get(2).ids).toEqual(['s:9', 'o:2']);
    expect((s as any).get('sw-trip-1', null)).toEqual({ ids: [], startedAt: null }); // and the drop is saved, so it happens once
    expect(t.toggle(2, 'o:2').ids).toEqual(['s:9']);
    expect(t.toggle(2, 'o:5').ids).toEqual(['s:9', 'o:5']);
  });
});
