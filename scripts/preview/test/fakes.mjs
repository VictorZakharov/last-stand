// A GitHub API as small as the scripts use: pull requests, build runs, gh-pages files and issue comments, held in
// plain objects a test sets up, with the writes it was asked for kept to look at.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const REPO = { owner: 'owner', repo: 'game' };

const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });

/** A pull request as the API returns it. */
export const pr = (number, sha, { state = 'open', merged = false } = {}) => ({
  number,
  state,
  merged,
  head: { sha },
});

/** A build run as the API returns it. */
export const run = (id, sha, { status = 'completed', conclusion = 'success', createdAt } = {}) => ({
  id,
  head_sha: sha,
  status,
  conclusion,
  event: 'pull_request',
  created_at: createdAt ?? `2026-10-31T16:00:${String(id % 60).padStart(2, '0')}Z`,
  html_url: `https://github.com/owner/game/actions/runs/${id}`,
});

/** `pulls`: every PR, open or not; `runs`: the build runs; `pages`: gh-pages' files by path, each a value
 *  (written as JSON) or the string 'dir' for a directory; `comments`: by PR number. */
export function fakeGithub({ pulls = [], runs = [], pages = {}, comments = {} } = {}) {
  const writes = [];
  const github = {
    writes,
    paginate: async (method, params) => (await method(params)).data,
    rest: {
      pulls: {
        list: async ({ state }) => ({ data: pulls.filter((p) => p.state === state) }),
        get: async ({ pull_number }) => {
          const found = pulls.find((p) => p.number === pull_number);
          if (!found) throw notFound();
          return { data: found };
        },
      },
      actions: {
        listWorkflowRuns: async ({ head_sha }) => ({
          data: { workflow_runs: runs.filter((r) => r.head_sha === head_sha) },
        }),
      },
      repos: {
        getContent: async ({ path: filePath }) => {
          if (pages[filePath] === 'dir') {
            const children = Object.keys(pages)
              .filter((key) => key.startsWith(`${filePath}/`) && !key.slice(filePath.length + 1).includes('/'))
              .map((key) => ({ name: key.slice(filePath.length + 1), type: pages[key] === 'dir' ? 'dir' : 'file' }));
            return { data: children };
          }
          if (!(filePath in pages)) throw notFound();
          return { data: { content: Buffer.from(JSON.stringify(pages[filePath])).toString('base64') } };
        },
      },
      issues: {
        listComments: async ({ issue_number }) => ({ data: comments[issue_number] ?? [] }),
        updateComment: async (params) => writes.push({ update: params }),
        createComment: async (params) => writes.push({ create: params }),
      },
    },
  };
  return github;
}

/** A directory of its own under the OS's temp, removed after the test. */
export function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Files under `dir`, each `relative path: contents`. */
export function writeFiles(dir, files) {
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
}

/** Every file under `dir`, as sorted relative paths with forward slashes. */
export function listFiles(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else found.push(path.relative(dir, entryPath).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return found.sort();
}

export const readJsonFile = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
