#!/bin/bash

RALPH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT=$(git rev-parse --show-toplevel)
REPO_NAME=$(basename "$REPO_ROOT")

require_env() {
  if [ ! -f "$RALPH_DIR/.env" ]; then
    echo "Missing .ralph/.env file. Copy the example and fill in your tokens:"
    echo "  cp .ralph/.env.example .ralph/.env"
    echo ""
    echo "Required:"
    echo "  GH_TOKEN  - GitHub PAT with 'repo' scope"
    exit 1
  fi

  local val
  val=$(grep "^GH_TOKEN=" "$RALPH_DIR/.env" | cut -d= -f2-)
  if [ -z "$val" ]; then
    echo "Missing GH_TOKEN in .ralph/.env"
    exit 1
  fi
}

load_env() {
  if [ -f "$RALPH_DIR/.env" ]; then
    local val
    val=$(grep "^GH_TOKEN=" "$RALPH_DIR/.env" | cut -d= -f2-)
    if [ -n "$val" ]; then export GH_TOKEN="$val"; fi
  fi
}

get_iterations() {
  if [ -n "$1" ]; then
    echo "$1"
  else
    jq -r '.defaultIterations // 100' "$RALPH_DIR/config.json"
  fi
}

# gh issue list --json emits raw null bytes between records when batching —
# invalid per JSON spec and breaks any downstream `jq` pipe. Strip them.
_gh_issues_clean() {
  gh issue list --state open --limit 200 --json number,title,body,comments "$@" | LC_ALL=C tr -d '\000'
}

# Fetch issues, optionally scoped to a parent PRD issue.
#
# If RALPH_SCOPE is set (e.g. "84" or "#84"):
#   - Returns open issues whose body references the scope via the "Parent PRD\n\n#N" convention.
#   - If no such children exist, returns just the scope issue itself (stand-alone issue).
#
# If RALPH_SCOPE is unset: returns all open issues (original behavior).
get_scoped_issues() {
  if [ -z "$RALPH_SCOPE" ]; then
    _gh_issues_clean
    return
  fi

  local scope="${RALPH_SCOPE#\#}"
  local filter="[.[] | select(.body // \"\" | test(\"Parent PRD[[:space:]]+#${scope}\\\\b\"))]"
  local scoped count
  scoped=$(_gh_issues_clean --jq "$filter")
  # printf '%s' preserves the payload; macOS bash's `echo` mangles some byte sequences and breaks downstream jq.
  count=$(printf '%s' "$scoped" | jq 'length' 2>/dev/null || echo 0)

  if [ -z "$count" ] || [ "$count" -eq 0 ]; then
    gh issue view "$scope" --json number,title,body,comments --jq '[.]' 2>/dev/null | LC_ALL=C tr -d '\000' || printf '[]'
  else
    printf '%s' "$scoped"
  fi
}
