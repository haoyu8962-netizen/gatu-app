#!/bin/bash
set -eo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

require_env
load_env

ITERATIONS=$(get_iterations "$1")
echo "Starting RALPH loop: $ITERATIONS iterations"
echo ""

# jq filter to extract streaming text from assistant messages
stream_text='select(.type == "assistant").message.content[]? | select(.type == "text").text // empty | gsub("\n"; "\r\n") | . + "\r\n\n"'

# jq filter to extract final result
final_result='select(.type == "result").result // empty'

for ((i=1; i<=ITERATIONS; i++)); do
  echo "========================================"
  echo "Iteration $i / $ITERATIONS"
  echo "========================================"

  tmpfile=$(mktemp)

  issues=$(get_scoped_issues)
  issue_count=$(printf '%s' "$issues" | jq 'length')

  if [ "$issue_count" -eq 0 ]; then
    if [ -n "$RALPH_SCOPE" ]; then
      echo "No open issues under scope #${RALPH_SCOPE#\#}. Nothing to do."
    else
      echo "No open issues. Nothing to do."
    fi
    exit 0
  fi

  if [ -n "$RALPH_SCOPE" ]; then
    echo "Open issues (scope #${RALPH_SCOPE#\#}): $issue_count"
  else
    echo "Open issues: $issue_count"
  fi

  ralph_commits=$(git log --grep="RALPH" -n 10 --format="%H%n%ad%n%B---" --date=short 2>/dev/null || echo "No RALPH commits found")

  # Ensure GH_TOKEN is available to claude subprocess for gh issue close
  ENABLE_SECURITY_REMINDER=0 \
  GH_TOKEN="$GH_TOKEN" \
  claude \
    --verbose \
    --print \
    --model claude-opus-4-6 \
    --dangerously-skip-permissions \
    --output-format stream-json \
    --settings "$RALPH_DIR/sandbox.json" \
    "$issues Previous RALPH commits: $ralph_commits @.ralph/prompt.md" \
  | grep --line-buffered '^{' \
  | tee "$tmpfile" \
  | jq --unbuffered -rj "$stream_text"

  # Check for COMPLETE in both the result event and the full text output
  result=$(jq -r "$final_result" "$tmpfile")
  all_text=$(jq -r 'select(.type == "assistant").message.content[]? | select(.type == "text").text // empty' "$tmpfile")

  rm -f "$tmpfile"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]] || [[ "$all_text" == *"<promise>COMPLETE</promise>"* ]]; then
    echo ""
    echo "RALPH complete after $i iterations."
    exit 0
  fi

  echo ""
done

echo "Finished $ITERATIONS iterations."
