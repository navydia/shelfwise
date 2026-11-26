import { describe, it, expect } from 'vitest';
// @ts-ignore
import { axisLock, armedSide, rowOutcome, rowOffset, sheetCloses, sheetOffset, velocity } from '../public/lib/swipe.js';

describe('swipe gestures', () => {
  it('axis_lock_waits_then_picks_the_dominant_axis', () => {
    expect(axisLock(3, 4)).toBe(null);
    expect(axisLock(12, 5)).toBe('x');
    expect(axisLock(-12, 5)).toBe('x');
    expect(axisLock(4, -14)).toBe('y');
  });

  it('armed_past_the_commit_point_only_for_sides_with_actions', () => {
    expect(armedSide(100, 300)).toBe(null);
    expect(armedSide(120, 300)).toBe('right');
    expect(armedSide(-120, 300)).toBe('left');
    expect(armedSide(-200, 300, { right: true, left: false })).toBe(null);
  });

  it('release_commits_when_armed_or_flicked', () => {
    expect(rowOutcome(150, 0, 300)).toBe('right');
    expect(rowOutcome(60, 0.8, 300)).toBe('right'); // fast flick, short distance
    expect(rowOutcome(-60, -0.8, 300)).toBe('left');
    expect(rowOutcome(30, 2, 300)).toBe(null); // too short even if fast
    expect(rowOutcome(60, 0.2, 300)).toBe(null); // too slow and too short: spring back
    expect(rowOutcome(80, -0.9, 300)).toBe(null); // flicking back toward the middle cancels
    expect(rowOutcome(-80, -0.9, 300, { right: true, left: false })).toBe(null);
  });

  it('row_follows_the_finger_toward_an_action_and_resists_otherwise', () => {
    expect(rowOffset(90)).toBe(90);
    expect(rowOffset(-90)).toBe(-90);
    const stiff = rowOffset(-300, { right: true, left: false });
    expect(stiff).toBeLessThan(0);
    expect(Math.abs(stiff)).toBeLessThanOrEqual(24);
  });

  it('sheet_closes_past_a_third_or_on_a_downward_flick', () => {
    expect(sheetCloses(100, 0, 600)).toBe(false);
    expect(sheetCloses(200, 0, 600)).toBe(true);
    expect(sheetCloses(60, 0.9, 600)).toBe(true);
    expect(sheetCloses(30, 2, 600)).toBe(false);
    expect(sheetCloses(-50, 2, 600)).toBe(false);
  });

  it('sheet_dragged_up_only_stretches_a_little', () => {
    expect(sheetOffset(40)).toBe(40);
    expect(sheetOffset(-400)).toBeGreaterThanOrEqual(-16);
    expect(sheetOffset(-400)).toBeLessThan(0);
  });

  it('velocity_uses_the_last_80ms', () => {
    expect(velocity([{ t: 0, v: 0 }])).toBe(0);
    expect(velocity([{ t: 0, v: 0 }, { t: 100, v: 10 }, { t: 150, v: 60 }])).toBeCloseTo(1, 5);
  });
});
