// A push being built: latest.json says `building` (since when, which run) and the stable page links the last
// build's folder as the previous one while it waits (#292).
import fs from 'node:fs';
import path from 'node:path';
import { clearRoot, previewDir, previousFolder, stablePage, writeLatest } from './pages.mjs';

/** The open PR whose head is `sha`, or undefined. */
export async function openPrFor(github, repo, sha) {
  const prs = await github.paginate(github.rest.pulls.list, { ...repo, state: 'open', per_page: 100 });
  return prs.find((pr) => pr.head.sha === sha);
}

/** PR `number`'s preview marked as building `sha` in the checkout. */
export function stageBuilding({ pagesDir, number, sha, since, run, template, repo }) {
  const dir = previewDir(pagesDir, number);
  fs.mkdirSync(dir, { recursive: true });
  const previous = previousFolder(dir);
  // a build published at the PR's root (before #299) goes; the commits' folders stay
  clearRoot(dir, { keepLatest: false });
  fs.writeFileSync(path.join(dir, 'index.html'), stablePage(template, { repo, number, folder: previous }));
  writeLatest(dir, { sha, state: 'building', folder: previous, since, run });
  fs.writeFileSync(path.join(pagesDir, '.nojekyll'), '');
}

/** Pages is deployed only when what it serves changed: the stable page reads latest.json from the branch. */
export const needsDeploy = (changed) => changed.some((file) => !file.endsWith('/latest.json'));
