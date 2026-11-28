// Margins collapsed as CSS's block flow collapses them (src/ui/kit/marginCollapse.ts): siblings' between them, a
// first or last child's through its parent where nothing keeps it in, a flex box's added.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collapseKids, joined } from '../../../src/ui/kit/marginCollapse.ts';

/** A box with margins `top`, `bottom` in the flow, its children's kept in. */
const box = (top, bottom, more = {}) => ({ own: [top, bottom], inFlow: true, through: false, closedTop: true,
  closedBottom: true, outer: [top, bottom], ...more });
/** A block its children's margins go through. */
const open = (top, bottom) => box(top, bottom, { through: true, closedTop: false, closedBottom: false });

test('two margins that meet are the larger of the positive and the most negative of the negative', () => {
  assert.equal(joined(6, 6), 6);
  assert.equal(joined(18, 6), 18);
  assert.equal(joined(10, -4), 6);
  assert.equal(joined(-3, -8), -8);
});

test('siblings stand the larger of their margins apart', () => {
  // (the guide's paragraph, 6 over and under, then a row of 6, then a heading of 22 over and 10 under)
  const kids = [box(6, 6), box(6, 6), box(22, 10)];
  collapseKids(box(0, 0), kids, true);
  assert.deepEqual(kids.map((kid) => kid.given), [[6, 6], [0, 6], [16, 10]]);
});

test('a flex box\'s children keep their margins whole', () => {
  const kids = [box(6, 6), box(6, 6)];
  collapseKids(box(0, 0), kids, false);
  assert.deepEqual(kids.map((kid) => kid.given), [[6, 6], [6, 6]]);
});

test('a first and last child\'s margins go through a block nothing keeps them in', () => {
  // (a list of 4 over and under, its items 3)
  const list = open(4, 4);
  const items = [box(3, 3), box(3, 3), box(3, 3)];
  collapseKids(list, items, true);
  assert.deepEqual(list.outer, [4, 4]);
  assert.deepEqual(items.map((kid) => kid.given), [[0, 3], [0, 3], [0, 0]]);
});

test('a padding keeps a child\'s margin in', () => {
  const card = box(12, 12, { through: true, closedTop: true, closedBottom: false });
  const kids = [box(6, 6), box(6, 20)];
  collapseKids(card, kids, true);
  assert.deepEqual(card.outer, [12, 20]);
  assert.deepEqual(kids.map((kid) => kid.given), [[6, 6], [0, 0]]);
});

test('a box out of the flow is passed by, and one of no plain margins stops the collapse', () => {
  const apart = { ...box(50, 50), inFlow: false };
  const auto = { ...box(0, 0), own: null, outer: undefined };
  const kids = [box(6, 6), apart, box(10, 0), auto, box(8, 0)];
  collapseKids(box(0, 0), kids, true);
  assert.deepEqual(kids.map((kid) => kid.given), [[6, 6], [50, 50], [4, 0], null, [8, 0]]);
});
