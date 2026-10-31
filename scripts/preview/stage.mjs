// A build put in a gh-pages checkout: in its commit's folder with probe files and the stable page beside it, the
// oldest folders pruned; or a closed PR's preview removed. Only files are copied: nothing from a build runs here.
import fs from 'node:fs';
import path from 'node:path';
import { clearRoot, previewDir, readJson, stablePage, writeJson } from './pages.mjs';

/** Plain files only: no nested repos or links out of the preview. */
export function cleanSite(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) fs.rmSync(entryPath, { force: true });
    else if (entry.isDirectory() && entry.name === '.git') fs.rmSync(entryPath, { recursive: true, force: true });
    else if (entry.isDirectory()) cleanSite(entryPath);
  }
}

/** The newest `keep` commit folders by when they were published stay; the rest go. */
export function pruneFolders(dir, keep) {
  const folders = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const published = (name) => readJson(path.join(dir, name, 'preview-metadata.json'))?.publishedAt ?? '';
  const newestFirst = folders
    .map((entry) => ({ name: entry.name, at: published(entry.name) }))
    .sort((a, b) => b.at.localeCompare(a.at));
  for (const old of newestFirst.slice(keep)) fs.rmSync(path.join(dir, old.name), { recursive: true, force: true });
}

/** The files Pages must serve before the build is called ready (`served-1.txt`...), each holding the commit. */
export const probeFile = (probe) => `served-${probe}.txt`;

/** Build `sha` of PR `number` from `siteDir` into the checkout: { layout: folder | root }. */
export function stageBuild({ pagesDir, number, sha, siteDir, template, repo, keepFolders, probes, now }) {
  const dir = previewDir(pagesDir, number);
  const folder = sha.slice(0, 7);
  cleanSite(siteDir);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(siteDir, folder))) {
    // a PR built before #299, for the preview's root: published there as it was
    fs.rmSync(dir, { recursive: true, force: true });
    fs.cpSync(siteDir, dir, { recursive: true });
    writeJson(path.join(dir, 'preview-metadata.json'), { headSha: sha });
    return { layout: 'root' };
  }
  // the build in its commit's folder, the stable page main's (the build's own beside it isn't used)
  clearRoot(dir, { keepLatest: true });
  const target = path.join(dir, folder);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(path.join(siteDir, folder), target, { recursive: true });
  const publishedAt = now.toISOString().replace(/\.\d+Z$/, 'Z');
  writeJson(path.join(target, 'preview-metadata.json'), { headSha: sha, publishedAt });
  for (let probe = 1; probe <= probes; probe++) fs.writeFileSync(path.join(target, probeFile(probe)), `${sha}\n`);
  fs.writeFileSync(path.join(dir, 'index.html'), stablePage(template, { repo, number, folder }));
  pruneFolders(dir, keepFolders);
  return { layout: 'folder' };
}

export function removePreview(pagesDir, number) {
  fs.rmSync(previewDir(pagesDir, number), { recursive: true, force: true });
}

/** Every publish and removal of `items` staged: what each came to, { number, sha, run, layout | state, link? }. */
export function stageItems({ pagesDir, items, origin, ...build }) {
  const staged = [];
  for (const item of items) {
    if (item.mode === 'remove') {
      removePreview(pagesDir, item.number);
      staged.push({ number: item.number, state: 'removed' });
      continue;
    }
    if (item.mode !== 'publish') continue;
    const { layout } = stageBuild({ ...build, pagesDir, number: item.number, sha: item.sha, siteDir: item.site });
    const entry = { number: item.number, sha: item.sha, run: item.run, layout };
    // a root build is done once it's pushed; a folder is probed first
    if (layout === 'root') Object.assign(entry, { state: 'ready', link: `${origin}/pr-preview/pr-${item.number}/` });
    staged.push(entry);
  }
  fs.writeFileSync(path.join(pagesDir, '.nojekyll'), '');
  return staged;
}
