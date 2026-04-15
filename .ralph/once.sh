#!/bin/bash
set -eo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

require_env
load_env

# Optional positional shortcut: `.ralph/once.sh 84` → scope to PRD #84
# `.ralph/once.sh --all` → skip the picker, run against all open issues
if [ "$1" = "--all" ]; then
  export RALPH_ALL=1
elif [ -n "$1" ] && [[ "$1" =~ ^#?[0-9]+$ ]]; then
  export RALPH_SCOPE="$1"
fi

pick_prd_scope

issues=$(get_scoped_issues)
ralph_commits=$(git log --grep="RALPH" -n 10 --format="%H%n%ad%n%B---" --date=short 2>/dev/null || echo "No RALPH commits found")

if [ -n "$RALPH_SCOPE" ]; then
  echo "Scope: PRD #${RALPH_SCOPE#\#} ($(printf '%s' "$issues" | jq 'length') open sub-issues)"
fi

claude \
  --model claude-opus-4-6 \
  --settings "$RALPH_DIR/sandbox.json" \
  "$issues Previous RALPH commits: $ralph_commits @.ralph/prompt.md"
