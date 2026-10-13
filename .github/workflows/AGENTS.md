# `.github/workflows`

The workflows, which the root's Workflow describes as rules.

The rules across the game are the [root AGENTS.md](../../AGENTS.md).

- `branch-policy.yml`: fails a PR whose branch holds a merge commit (PR branches are linear).
- `pr-preview-build.yml`: builds a PR's preview with a read-only token (the lab's unit tests, the typecheck and build, the Pages paths), forks included.
- `pr-preview.yml`: a `workflow_run`, always the copy on `main`, which checks the artifact's PR number against the API and publishes it under `pr-preview/pr-N/` in the aggregated `gh-pages` branch. **Never run PR code in it.**
- `deploy-pages.yml`: on a merge to `main`, production at the root of `gh-pages`, the open PRs' previews kept.

Don't switch Pages to "GitHub Actions only", and don't delete the `gh-pages` branch.
