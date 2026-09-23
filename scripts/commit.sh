#!/usr/bin/env bash
# Fork workflow, step 2: commit the issue branch, push it to the fork and open the upstream PR.
# Rerun after review changes: it commits, rebases and pushes to the same PR.
# Usage: scripts/commit.sh   (prompts for a title and, for a new PR, a description)
# See CONTRIBUTE.md.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

repo_of() { git remote get-url "$1" | sed -E 's#^.*github\.com[:/]##; s#\.git$##'; }
UPSTREAM=$(repo_of upstream)
FORK=$(repo_of origin)

branch=$(git branch --show-current)
if [[ ! $branch =~ (^|/)issue-([0-9]+)$ ]]; then
  echo "Not on an issue branch (fix/issue-N): '$branch'" >&2
  exit 1
fi
num=${BASH_REMATCH[2]}

git fetch -q upstream
dirty=$(git status --porcelain)
if [[ -z $dirty && $(git rev-list --count upstream/main..HEAD) -eq 0 ]]; then
  echo "Nothing to commit or push." >&2
  exit 1
fi

npm run build
npm run check:pages

pr=$(gh pr list -R "$UPSTREAM" --head "$branch" --author @me --state open --json url -q '.[0].url // empty')
if [[ -z $pr ]]; then
  default=$(gh issue view "$num" -R "$UPSTREAM" --json title -q .title)
else
  default="Address review feedback"
fi

title=""
if [[ -n $dirty || -z $pr ]]; then
  read -r -p "title [$default]: " title
  title=${title:-$default}
fi
descr=""
if [[ -z $pr ]]; then echo "descr (Ctrl-D to finish):"; descr=$(cat); fi

if [[ -n $dirty ]]; then
  git add -A
  git commit -q -m "$title"
fi

# Upstream only merges linear branches that are up to date with main.
if ! git rebase -q upstream/main; then
  echo "Rebase conflict: resolve it, run git rebase --continue, then rerun this script." >&2
  exit 1
fi
git push -q --force-with-lease -u origin "$branch"

if [[ -z $pr ]]; then
  # The closing keyword must be in the body (not the title) to link the PR and the issue.
  body="Closes #$num"
  if [[ -n $descr ]]; then body+=$'\n\n'"$descr"; fi
  pr=$(gh pr create -R "$UPSTREAM" --base main --head "${FORK%%/*}:$branch" --title "$title" --body "$body")
fi
echo "PR: $pr"
