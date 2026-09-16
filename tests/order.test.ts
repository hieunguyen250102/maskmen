import { describe, expect, it } from 'vitest';
import {
  addRelation,
  areComparable,
  emptyOrder,
  isKnownStronger,
  strengthLines,
} from '@/engine/order.js';

const [TIGRE, ROSA, FANTASMA, TRUENO] = [0, 1, 2, 3];

describe('strength order', () => {
  it('knows nothing to begin with', () => {
    const order = emptyOrder();
    expect(isKnownStronger(order, TIGRE, ROSA)).toBe(false);
    expect(areComparable(order, TIGRE, ROSA)).toBe(false);
  });

  it('records a direct relation without asserting the converse', () => {
    const order = addRelation(emptyOrder(), ROSA, TRUENO);
    expect(isKnownStronger(order, ROSA, TRUENO)).toBe(true);
    expect(isKnownStronger(order, TRUENO, ROSA)).toBe(false);
  });

  it('closes transitively, matching the rulebook example', () => {
    // The manual's own worked example: red beats blue, then orange beats red,
    // so orange must also beat blue.
    let order = addRelation(emptyOrder(), ROSA, TRUENO);
    order = addRelation(order, TIGRE, ROSA);
    expect(isKnownStronger(order, TIGRE, TRUENO)).toBe(true);
  });

  it('leaves untouched branches incomparable', () => {
    // orange > red > blue, and green > red, but orange vs green is unknown --
    // this is precisely when the physical game needs a second line.
    let order = addRelation(emptyOrder(), ROSA, TRUENO);
    order = addRelation(order, TIGRE, ROSA);
    order = addRelation(order, FANTASMA, ROSA);
    expect(areComparable(order, TIGRE, FANTASMA)).toBe(false);
  });

  it('does not mutate the input order', () => {
    const before = emptyOrder();
    addRelation(before, ROSA, TRUENO);
    expect(isKnownStronger(before, ROSA, TRUENO)).toBe(false);
  });

  it('refuses contradictory relations', () => {
    const order = addRelation(emptyOrder(), ROSA, TRUENO);
    expect(() => addRelation(order, TRUENO, ROSA)).toThrow(/contradictory/);
    expect(() => addRelation(order, ROSA, ROSA)).toThrow(/cannot beat itself/);
  });
});

describe('strengthLines', () => {
  it('draws a known chain as a single line, strongest first', () => {
    let order = addRelation(emptyOrder(), ROSA, TRUENO);
    order = addRelation(order, TIGRE, ROSA);
    const debuted = [true, true, false, true, false, false];
    expect(strengthLines(order, debuted)).toEqual([[TIGRE, ROSA, TRUENO]]);
  });

  it('starts a second line when two wrestlers cannot be compared', () => {
    // The rulebook's example: orange and green both beat red, but nothing is
    // known about orange versus green, so they cannot share a line.
    let order = addRelation(emptyOrder(), ROSA, TRUENO);
    order = addRelation(order, TIGRE, ROSA);
    order = addRelation(order, FANTASMA, ROSA);
    const lines = strengthLines(order, [true, true, true, true, false, false]);

    expect(lines).toHaveLength(2);
    expect(lines).toContainEqual([TIGRE, ROSA, TRUENO]);
    expect(lines).toContainEqual([FANTASMA, ROSA, TRUENO]);
  });

  it('gives a debuted wrestler with no known relations its own line', () => {
    const order = addRelation(emptyOrder(), TIGRE, ROSA);
    const lines = strengthLines(order, [true, true, true, false, false, false]);
    expect(lines).toContainEqual([TIGRE, ROSA]);
    expect(lines).toContainEqual([FANTASMA]);
  });

  it('never places a wrestler above one it is not known to beat', () => {
    // TIGRE > ROSA, and FANTASMA is unrelated to both. FANTASMA must not end up
    // stacked above ROSA in any line.
    const order = addRelation(emptyOrder(), TIGRE, ROSA);
    for (const line of strengthLines(order, [true, true, true, false, false, false])) {
      for (let i = 0; i < line.length - 1; i++) {
        expect(isKnownStronger(order, line[i]!, line[i + 1]!)).toBe(true);
      }
    }
  });

  it('omits wrestlers that have not debuted', () => {
    expect(strengthLines(emptyOrder(), [false, false, false, false, false, false])).toEqual([]);
  });
});
