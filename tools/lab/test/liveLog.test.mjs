import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { LiveLog, pictureName } from '../node/liveLog.mjs';
import { OUT } from '../node/paths.mjs';

mkdirSync(OUT, { recursive: true });

/** A log in a folder of its own, removed after `use`. */
function withLog(use) {
  const dir = mkdtempSync(join(OUT, 'test-'));
  try {
    use(join(dir, 'live', 'steps.json'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a log read back from its file has the start, the steps and the pictures counted', () => {
  withLog((file) => {
    const log = new LiveLog(file);
    log.begin({ heroClass: 'warrior', fixture: { view: 'first' } });
    log.add({ kind: 'eval', expression: 'lab.joints.handR.rotation.x = 1' });
    log.add({ kind: 'frames', count: 30 });
    log.nextPicture();
    const again = new LiveLog(file);
    assert.deepEqual(again.start, { heroClass: 'warrior', fixture: { view: 'first' } });
    assert.deepEqual(again.steps.map((step) => step.kind), ['eval', 'frames']);
    assert.equal(again.nextPicture(), 2);
  });
});

test('starting again forgets the steps; clearing forgets the session and its file', () => {
  withLog((file) => {
    const log = new LiveLog(file);
    log.begin({ heroClass: 'ranger', fixture: {} });
    log.add({ kind: 'frames', count: 1 });
    log.begin({ heroClass: 'mage', fixture: {} });
    assert.equal(log.steps.length, 0);
    log.clear();
    assert.equal(log.started, false);
    assert.equal(existsSync(file), false);
    assert.deepEqual(log.describe(), ['no live session (lab live start)']);
  });
});

test('only a step that changes the page is kept to replay', () => {
  withLog((file) => {
    const log = new LiveLog(file);
    log.begin({ heroClass: 'warrior', fixture: {} });
    assert.throws(() => log.add({ kind: 'picture' }), /changes nothing to replay/);
  });
});

test('the steps described in the order they ran', () => {
  withLog((file) => {
    const log = new LiveLog(file);
    log.begin({ heroClass: 'warrior', fixture: { gear: 'twoHanded' } });
    log.add({ kind: 'eval', expression: '1 + 1' });
    log.add({ kind: 'frames', count: 4 });
    assert.deepEqual(log.describe(), [
      'started: the warrior, set up as {"gear":"twoHanded"}',
      '1. eval 1 + 1',
      '2. frames 4',
    ]);
  });
});

test('a picture named by its number, view and look, the lit look left out', () => {
  assert.equal(pictureName(7, 'eyes', 'lit'), '007-eyes.png');
  assert.equal(pictureName(12, 'front', 'parts'), '012-front-parts.png');
  assert.equal(pictureName(3, 'third'), '003-third.png');
});
