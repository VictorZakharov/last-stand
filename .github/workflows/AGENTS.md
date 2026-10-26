# `.github/workflows`

The workflows, which the root's Workflow describes as rules.

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- `branch-policy.yml`: fails a PR whose branch holds a merge commit (PR branches are linear).
- `pr-preview-build.yml`: builds a PR's preview with a read-only token (the lab's unit tests, the typecheck and build, the Pages paths), forks included.
- `pr-preview.yml`: a `workflow_run`, always the copy on `main`, which checks the artifact's PR number against the API and publishes it in the aggregated `gh-pages` branch. **Never run PR code in it.** Each build has a folder of its own, `pr-preview/pr-N/<sha7>/`, which the comment links (#299): Pages' CDN caches a path for up to 10 minutes, 404s included, and ignores a query string, so a build published over the last at one path was served old for minutes after the comment said ready. A commit's folder is a path nothing asked for before it's served, and it's called ready only once probe files published with it are served (a 404 the CDN caches lands on a probe). `pr-preview/pr-N/` is the stable page (`.github/preview-index.html`, main's copy), which goes to the newest build by the PR's `latest.json` (building, ready or failed), read from the branch through GitHub's API, never the CDN: while a push builds it says how long, the previous build linked as such (#292). The newest three folders are kept, so a stable page served from the cache never goes to one that's gone; a folder pruned, or a closed PR's preview, is answered by production's `404.html`, which sends it to the PR's stable page or the game (an installed app left there showed Pages' plain 404: `scripts/AGENTS.md`). The build itself (`pr-preview-build.yml`) makes the folder: `--base` ends in the commit's seven characters, and a stable page is put beside it, so main's copy before #299, which published the whole artifact at `pr-N/`, publishes it right too. Every job that writes `gh-pages` or deploys Pages, production's included, is in the `pages-publisher` group: GitHub keeps one pending job a group, so a third arriving cancels the pending one, and a publish can be lost when several PRs push at once (re-run it).
- `deploy-pages.yml`: on a merge to `main`, production at the root of `gh-pages`, the open PRs' previews kept.

Don't switch Pages to "GitHub Actions only", and don't delete the `gh-pages` branch.
