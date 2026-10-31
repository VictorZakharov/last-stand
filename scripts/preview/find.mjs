// Which builds a publish run publishes: the one that triggered it, and every open PR's newest finished build that
// gh-pages doesn't record yet (a publish cancelled while it waited in the group). Each build's artifact ran PR
// code, so the PR its pr.json names is believed only when the API agrees: that PR's head is the commit built.
import { SETTLED, isPublished, latestOf } from './pages.mjs';

const BUILD_WORKFLOW = 'pr-preview-build.yml';
const FAILED = ['failure', 'timed_out', 'startup_failure'];

/** A build that ended in something to publish: its preview, or a failed build to say so. */
export function finished(run) {
  if (run.status !== 'completed') return false;
  return run.conclusion === 'success' || FAILED.includes(run.conclusion);
}

const asBuild = (run) => ({ id: run.id, sha: run.head_sha, url: run.html_url, conclusion: run.conclusion });

/** The newest finished build of `sha`, or null; none while a newer one runs (its own publish comes). */
export function newestFinished(runs) {
  const newestFirst = [...runs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const newest = newestFirst.find(finished);
  if (!newest) return null;
  const newerRunning = newestFirst.some((run) => run.status !== 'completed' && run.created_at > newest.created_at);
  return newerRunning ? null : newest;
}

/** The builds to look at: the trigger (a finished PR build), then each open PR's head not yet published. */
export async function findBuilds({ github, repo, pages, prs, trigger, log }) {
  const builds = new Map();
  const consider = (run, why) => {
    log(`build ${run.id} (${run.head_sha.slice(0, 7)}, ${run.conclusion}): ${why}`);
    builds.set(run.id, asBuild(run));
  };
  if (trigger?.event === 'pull_request' && finished(trigger)) consider(trigger, 'triggered this run');
  for (const pr of prs) {
    if (await isPublished(pages, pr.number, pr.head.sha)) continue;
    const { data } = await github.rest.actions.listWorkflowRuns({
      ...repo,
      workflow_id: BUILD_WORKFLOW,
      event: 'pull_request',
      head_sha: pr.head.sha,
      per_page: 30,
    });
    const newest = newestFinished(data.workflow_runs);
    if (newest) consider(newest, `the newest finished build of PR #${pr.number}, unpublished`);
  }
  return [...builds.values()];
}

/** What a build is for, as the API has it: { mode: publish | remove | failed, number } or null (nothing to do).
 *  `artifact` is { claim, site } from its download: claim is its pr.json, null when missing or unreadable. */
export async function checkBuild({ github, repo, pages, prs, build, artifact, log }) {
  const item = { id: build.id, sha: build.sha, run: build.url, site: artifact?.site ?? null };
  if (build.conclusion !== 'success' || !artifact?.claim) {
    const number = prs.find((pr) => pr.head.sha === build.sha)?.number;
    return number ? { ...item, mode: 'failed', number } : null;
  }
  const { number, action } = artifact.claim;
  if (!Number.isInteger(number) || number <= 0) {
    log(`build ${build.id}: bad PR number ${number}`);
    return null;
  }
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: number });
  // superseded by a newer push
  if (pr.head.sha !== build.sha) return null;
  if (action === 'closed') {
    const unmerged = pr.state === 'closed' && !pr.merged;
    return unmerged ? { ...item, mode: 'remove', number } : null;
  }
  if (pr.state !== 'open') return null;
  // a build a catch-up already published isn't published again when its own run comes
  const latest = await latestOf(pages, number);
  if (latest?.headSha === build.sha && latest.run === build.url && SETTLED.includes(latest.state)) {
    log(`PR #${number}: ${build.sha.slice(0, 7)} already ${latest.state}`);
    return null;
  }
  return { ...item, mode: 'publish', number };
}

/** Previews whose PR was closed unmerged, left when their removal was lost (merged ones go with production's
 *  deploy). `skip` holds the PRs already handled. */
export async function findClosed({ github, repo, pages, prs, skip }) {
  const open = new Set(prs.map((pr) => pr.number));
  const closed = [];
  for (const entry of await pages.list('pr-preview')) {
    const number = Number(/^pr-(\d+)$/.exec(entry.name)?.[1]);
    if (entry.type !== 'dir' || !number || open.has(number) || skip.has(number)) continue;
    const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: number });
    if (pr.state === 'closed' && !pr.merged) closed.push({ id: 0, mode: 'remove', number });
  }
  return closed;
}

/** Everything this run publishes, one item a PR (its newest build's). `fetchArtifact(build)` downloads a
 *  successful build's artifact and returns { claim, site }. */
export async function findItems({ github, repo, pages, trigger, fetchArtifact, log }) {
  const prs = await github.paginate(github.rest.pulls.list, { ...repo, state: 'open', per_page: 100 });
  const items = new Map();
  const add = (item) => {
    if ((items.get(item.number)?.id ?? 0) > item.id) return;
    log(`PR #${item.number}: ${item.mode} ${item.sha ?? ''}`);
    items.set(item.number, item);
  };
  for (const build of await findBuilds({ github, repo, pages, prs, trigger, log })) {
    const artifact = build.conclusion === 'success' ? await fetchArtifact(build) : null;
    const item = await checkBuild({ github, repo, pages, prs, build, artifact, log });
    if (item) add(item);
  }
  for (const item of await findClosed({ github, repo, pages, prs, skip: new Set(items.keys()) })) add(item);
  return [...items.values()];
}
