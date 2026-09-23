#!/usr/bin/env bash
# Fork workflow, step 1: open an upstream issue and start its branch off a fresh main.
# Usage: scripts/issue.sh ["title" ["description"]]   (prompts for whatever is missing)
# See CONTRIBUTE.md.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

repo_of() { git remote get-url "$1" | sed -E 's#^.*github\.com[:/]##; s#\.git$##'; }
UPSTREAM=$(repo_of upstream)

if [[ -n $(git status --porcelain) ]]; then
  echo "Working tree is not clean: commit or stash first." >&2
  exit 1
fi

title=${1:-}
[[ -n $title ]] || read -r -p "title: " title
[[ -n $title ]] || { echo "A title is required." >&2; exit 1; }
if [[ $# -ge 2 ]]; then descr=$2; else echo "descr (Ctrl-D to finish):"; descr=$(cat); fi

# Sync before creating the issue, so a failure here doesn't leave an issue without a branch.
git switch -q main
git fetch -q upstream
git merge -q --ff-only upstream/main
git push -q origin main

url=$(gh issue create -R "$UPSTREAM" --title "$title" --body "$descr")
num=${url##*/}
branch="fix/issue-$num"
git switch -q -c "$branch"

prompt="Work on issue #$num: $url
You are on branch $branch, fresh off upstream/main.

$title

$descr

When done, run npm run build and npm run check:pages. Don't commit or push: I'll run scripts/commit.sh. End with a short PR description (what changed, how it was tested)."

echo "Issue:  $url"
echo "Branch: $branch"
echo
echo "Prompt for Claude:"
echo "----"
echo "$prompt"
echo "----"
if command -v pbcopy >/dev/null; then printf '%s' "$prompt" | pbcopy && echo "(copied to clipboard)"; fi
