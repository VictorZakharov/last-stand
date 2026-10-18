// A swing's path through the eyes (page/swingPath.ts): an elbow turned over round the line to its grip between two
// steps is read as a jump, one laid out as an arm moves isn't, and a two-hander's lower grip past the other arm's
// reach is read where it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { describePath, pathJumps, pathShares, plantedFlip } from '../page/swingPath.ts';

/** the point a plane turns about, as the eyes have the right shoulder */
const PIVOT = new THREE.Vector3(0.22, -0.3, -0.22);
const UP = new THREE.Vector3(0, 1, 0);
/** a let-go past the other arm's reach (m), as the game's */
const LET_GO = 0.077;

/** A swing's steps: the grip swept round the pivot across the view, its elbow hung below the line to it, and turned
 *  over to above it from `flipAt` on (a share, or never); the lower grip `lowerPast(share)` past the other arm's reach. */
function stepsOf({ flipAt = 2, lowerPast = () => -0.1 } = {}) {
  return pathShares().map((share) => {
    const angle = (share - 0.5) * Math.PI;
    const grip = new THREE.Vector3(Math.sin(angle) * 0.6, -0.1, -Math.cos(angle) * 0.6).add(PIVOT);
    const elbow = grip.clone().sub(PIVOT).multiplyScalar(0.5).add(PIVOT);
    elbow.y += share >= flipAt ? 0.15 : -0.15;
    return { share, pivot: PIVOT.clone(), grip, elbow, lowerPast: lowerPast(share) };
  });
}

test('an elbow laid out as an arm moves is no jump', () => {
  assert.deepEqual(pathJumps(stepsOf()), []);
});

test('an elbow turned over round the line to its grip between two steps is a jump there', () => {
  const jumps = pathJumps(stepsOf({ flipAt: 0.4 }));
  assert.equal(jumps.length, 1);
  assert.equal(jumps[0].share, 0.4);
  assert.ok(jumps[0].elbow > 0.25);
});

test('the canary\'s flip is read as a jump into its step', () => {
  const planted = plantedFlip(stepsOf());
  assert.ok(pathJumps(planted.steps).some((jump) => Math.abs(jump.share - planted.share) < 1e-9));
});

test('a lower grip past the other arm\'s reach is a problem over the steps it\'s past, and within it none', () => {
  const past = describePath('cut', stepsOf({ lowerPast: (share) => (share > 0.3 && share < 0.6 ? 0.12 : 0) }), LET_GO);
  assert.equal(past.problems.length, 1);
  assert.match(past.problems[0], /0\.31-0\.59 up to 12\.0 cm/);
  const within = describePath('cut', stepsOf({ lowerPast: () => 0.05 }), LET_GO);
  assert.deepEqual(within.problems, []);
  assert.match(within.lines[1], /5\.0 cm past the other arm's reach/);
});

test('a one-hander has no lower grip to read', () => {
  const one = describePath('cut', stepsOf({ lowerPast: () => null }), LET_GO);
  assert.equal(one.lines.length, 1);
});
