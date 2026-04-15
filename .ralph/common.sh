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
# Interactive PRD picker. Lists open issues whose title starts with "PRD"
# and asks the operator to pick one (or "a" for all unscoped issues).
#
# Skipped when:
#   - RALPH_SCOPE is already set
#   - RALPH_ALL=1 (user opted into all issues)
#   - stdin/stdout is not a TTY (non-interactive invocations like cron)
#   - no PRDs are open
pick_prd_scope() {
  if [ -n "$RALPH_SCOPE" ] || [ "${RALPH_ALL:-0}" = "1" ]; then
    return
  fi
  if [ ! -t 0 ] || [ ! -t 1 ]; then
    return
  fi

  # Derive parent issues from the graph: any issue referenced by another
  # issue's "## Parent PRD\n\n#N" section is a parent. Then look up each
  # parent's title from the same open-issue set.
  local all_issues parent_nums prds
  all_issues=$(gh issue list --state open --limit 200 --json number,title,body 2>/dev/null | LC_ALL=C tr -d '\000')
  # The convention is `## Parent PRD\n\n#N` (blank line separator), so we
  # need lines *after* the header — grep -A2 + filter for leading `#N`.
  parent_nums=$(printf '%s' "$all_issues" \
    | jq -r '.[].body // ""' 2>/dev/null \
    | grep -A2 'Parent PRD' \
    | grep -oE '^#[0-9]+' \
    | tr -d '#' \
    | sort -u -n)
  if [ -z "$parent_nums" ]; then
    return
  fi
  prds=$(printf '%s\n' "$parent_nums" | while read -r n; do
    [ -z "$n" ] && continue
    title=$(printf '%s' "$all_issues" | jq -r --argjson n "$n" '.[] | select(.number == $n) | .title' 2>/dev/null)
    [ -z "$title" ] && continue
    printf '%s\t%s\n' "$n" "$title"
  done)

  if [ -z "$prds" ]; then
    return
  fi

  echo "Open PRDs:" >&2
  echo "" >&2
  local i=1
  local numbers=()
  while IFS=$'\t' read -r num title; do
    [ -z "$num" ] && continue
    printf "  %d) #%s  %s\n" "$i" "$num" "$title" >&2
    numbers+=("$num")
    i=$((i+1))
  done <<< "$prds"
  printf "  a) all open issues (no scope)\n" >&2
  echo "" >&2
  printf "Choose [1-%d/a]: " "${#numbers[@]}" >&2

  local choice
  read -r choice

  if [ -z "$choice" ] || [ "$choice" = "a" ] || [ "$choice" = "A" ]; then
    return
  fi
  if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#numbers[@]}" ]; then
    export RALPH_SCOPE="${numbers[$((choice-1))]}"
    echo "" >&2
  else
    echo "Invalid selection: $choice" >&2
    exit 1
  fi
}

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
