// A build put in a gh-pages checkout (stage.mjs), and a push marked as building (building.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { needsDeploy, stageBuilding } from '../building.mjs';
import { stageItems } from '../stage.mjs';
import { listFiles, readJsonFile, tempDir, writeFiles } from './fakes.mjs';

const SHA = '1234567'.padEnd(40, 'a');
const TEMPLATE = 'repo=__REPO__ pr=__PR__ folder=__FOLDER__ again=__FOLDER__';
const BUILD = { template: TEMPLATE, repo: 'owner/game', keepFolders: 3, probes: 2, origin: 'https://site.test' };

/** PR 7's build of `SHA` from `site`, to publish. */
const publish = (site) => [{ number: 7, mode: 'publish', sha: SHA, run: 'r', site }];

/** A build's artifact for `sha` at `dir`: the game in its commit's folder, the build's own stable page beside it. */
function artifact(dir, sha) {
  const folder = sha.slice(0, 7);
  writeFiles(dir, { [`${folder}/index.html`]: 'game', [`${folder}/assets/a.js`]: 'js', 'index.html': 'theirs' });
  return dir;
}

test('a build goes in its commit folder, with probes, metadata and main\'s stable page', (t) => {
  const root = tempDir(t);
  const pagesDir = path.join(root, 'pages');
  writeFiles(pagesDir, { 'pr-preview/pr-7/latest.json': '{"state":"building"}', 'pr-preview/pr-7/old-root.js': 'x' });
  const site = artifact(path.join(root, 'site'), SHA);
  const now = new Date('2026-10-31T16:00:00.123Z');
  const staged = stageItems({ ...BUILD, pagesDir, now, items: publish(site) });
  assert.deepEqual(staged, [{ number: 7, sha: SHA, run: 'r', layout: 'folder' }]);
  const preview = path.join(pagesDir, 'pr-preview', 'pr-7');
  assert.deepEqual(listFiles(preview), [
    '1234567/assets/a.js',
    '1234567/index.html',
    '1234567/preview-metadata.json',
    '1234567/served-1.txt',
    '1234567/served-2.txt',
    'index.html',
    'latest.json',
  ]);
  const page = fs.readFileSync(path.join(preview, 'index.html'), 'utf8');
  assert.equal(page, 'repo=owner/game pr=7 folder=1234567 again=1234567');
  assert.deepEqual(readJsonFile(path.join(preview, '1234567', 'preview-metadata.json')), {
    headSha: SHA,
    publishedAt: '2026-10-31T16:00:00Z',
  });
  assert.equal(fs.readFileSync(path.join(preview, '1234567', 'served-2.txt'), 'utf8').trim(), SHA);
  assert.ok(fs.existsSync(path.join(pagesDir, '.nojekyll')));
});

test('the newest folders by when they were published are kept, the rest pruned', (t) => {
  const root = tempDir(t);
  const pagesDir = path.join(root, 'pages');
  const meta = (at) => JSON.stringify({ headSha: 'x', publishedAt: at });
  writeFiles(pagesDir, {
    'pr-preview/pr-7/aaaaaaa/preview-metadata.json': meta('2026-10-31T10:00:00Z'),
    'pr-preview/pr-7/bbbbbbb/preview-metadata.json': meta('2026-10-31T12:00:00Z'),
    'pr-preview/pr-7/ccccccc/preview-metadata.json': meta('2026-10-31T11:00:00Z'),
  });
  const site = artifact(path.join(root, 'site'), SHA);
  const now = new Date('2026-10-31T16:00:00Z');
  stageItems({ ...BUILD, pagesDir, now, items: publish(site) });
  const folders = fs.readdirSync(path.join(pagesDir, 'pr-preview', 'pr-7')).filter((name) => name !== 'index.html');
  assert.deepEqual(folders.sort(), ['1234567', 'bbbbbbb', 'ccccccc']);
});

test('a build from before #299 is published at the preview root, and is ready once pushed', (t) => {
  const root = tempDir(t);
  const pagesDir = path.join(root, 'pages');
  const site = path.join(root, 'site');
  writeFiles(site, { 'index.html': 'game', 'assets/a.js': 'js' });
  const staged = stageItems({
    ...BUILD,
    pagesDir,
    now: new Date(),
    items: publish(site),
  });
  assert.deepEqual(staged, [
    { number: 7, sha: SHA, run: 'r', layout: 'root', state: 'ready', link: 'https://site.test/pr-preview/pr-7/' },
  ]);
  assert.deepEqual(listFiles(path.join(pagesDir, 'pr-preview', 'pr-7')), [
    'assets/a.js',
    'index.html',
    'preview-metadata.json',
  ]);
});

test('nested repos and links in a build are not published', (t) => {
  const root = tempDir(t);
  const pagesDir = path.join(root, 'pages');
  const site = artifact(path.join(root, 'site'), SHA);
  writeFiles(site, { '1234567/.git/config': 'x', '1234567/deep/.git/HEAD': 'x' });
  let linked = true;
  try {
    fs.symlinkSync(path.join(root, 'outside'), path.join(site, '1234567', 'link'));
  } catch {
    // (Windows without the right to make links: the rest is still checked)
    linked = false;
  }
  stageItems({ ...BUILD, pagesDir, now: new Date(), items: publish(site) });
  const published = listFiles(path.join(pagesDir, 'pr-preview', 'pr-7', '1234567'));
  assert.ok(!published.some((file) => file.includes('.git/')), published.join(', '));
  if (linked) assert.ok(!fs.existsSync(path.join(pagesDir, 'pr-preview', 'pr-7', '1234567', 'link')));
});

test('a removal takes the whole preview, and says so', (t) => {
  const pagesDir = tempDir(t);
  writeFiles(pagesDir, { 'pr-preview/pr-7/1234567/index.html': 'x', 'pr-preview/pr-8/index.html': 'y' });
  const staged = stageItems({ ...BUILD, pagesDir, now: new Date(), items: [{ id: 0, number: 7, mode: 'remove' }] });
  assert.deepEqual(staged, [{ number: 7, state: 'removed' }]);
  assert.deepEqual(listFiles(path.join(pagesDir, 'pr-preview')), ['pr-8/index.html']);
});

test('a failed build stages nothing', (t) => {
  const pagesDir = tempDir(t);
  const staged = stageItems({ ...BUILD, pagesDir, now: new Date(), items: [{ number: 7, mode: 'failed', sha: SHA }] });
  assert.deepEqual(staged, []);
  assert.ok(!fs.existsSync(path.join(pagesDir, 'pr-preview')));
});

test('a push being built: latest.json says so, the stable page links the last build', (t) => {
  const pagesDir = tempDir(t);
  writeFiles(pagesDir, {
    'pr-preview/pr-7/latest.json': JSON.stringify({ headSha: 'old', state: 'ready', folder: 'abcdef0' }),
    'pr-preview/pr-7/abcdef0/index.html': 'game',
    'pr-preview/pr-7/from-the-root.js': 'x',
  });
  const since = '2026-10-31T16:00:00Z';
  stageBuilding({ pagesDir, number: 7, sha: SHA, since, run: 'r', template: TEMPLATE, repo: 'o/g' });
  const preview = path.join(pagesDir, 'pr-preview', 'pr-7');
  assert.deepEqual(readJsonFile(path.join(preview, 'latest.json')), {
    headSha: SHA,
    state: 'building',
    folder: 'abcdef0',
    since: '2026-10-31T16:00:00Z',
    run: 'r',
  });
  assert.equal(fs.readFileSync(path.join(preview, 'index.html'), 'utf8'), 'repo=o/g pr=7 folder=abcdef0 again=abcdef0');
  assert.deepEqual(listFiles(preview), ['abcdef0/index.html', 'index.html', 'latest.json']);
});

test("a PR's first build has no previous folder", (t) => {
  const pagesDir = tempDir(t);
  stageBuilding({ pagesDir, number: 7, sha: SHA, since: 's', run: 'r', template: TEMPLATE, repo: 'o/g' });
  assert.equal(readJsonFile(path.join(pagesDir, 'pr-preview', 'pr-7', 'latest.json')).folder, null);
});

test('Pages is deployed only when what it serves changed', () => {
  assert.equal(needsDeploy(['pr-preview/pr-7/latest.json']), false);
  assert.equal(needsDeploy(['pr-preview/pr-7/latest.json', 'pr-preview/pr-7/index.html']), true);
  assert.equal(needsDeploy([]), false);
});
