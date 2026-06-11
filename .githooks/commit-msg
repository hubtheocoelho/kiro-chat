#!/bin/sh
#
# QAC commit-msg hook — validates QAC trailers on agent commits.
#
# If a commit has no Agent: trailer, it is treated as a human commit and passes.
# If a commit has Agent: trailer, all four QAC trailers are validated.
#
# Install:
#   cp commit-msg-hook.sh .git/hooks/commit-msg && chmod +x .git/hooks/commit-msg
#
# Or via core.hooksPath:
#   mkdir -p .githooks && cp commit-msg-hook.sh .githooks/commit-msg
#   chmod +x .githooks/commit-msg
#   git config core.hooksPath .githooks

COMMIT_MSG_FILE="$1"
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

has_trailer() {
  echo "$COMMIT_MSG" | grep -qE "^$1:"
}

get_trailer_value() {
  echo "$COMMIT_MSG" | grep -E "^$1:" | sed "s/^$1:[[:space:]]*//"
}

# Not an agent commit — pass without validation
if ! has_trailer "Agent"; then
  exit 0
fi

ERRORS=""

# Check all four mandatory trailers are present
for trailer in Agent Mode What Why; do
  if ! has_trailer "$trailer"; then
    ERRORS="${ERRORS}\n  missing trailer: $trailer"
  fi
done

if [ -n "$ERRORS" ]; then
  # printf interprets \n consistently across shells; echo does not (bash vs dash)
  printf "QAC: agent commit rejected — missing required trailers:%b\n" "$ERRORS"
  echo ""
  echo "Required format:"
  echo "  Agent: <agent name>"
  echo "  Mode: <hitl | autonomous>"
  echo "  What: <semantic summary>"
  echo "  Why: <condition + impact>"
  exit 1
fi

# Validate Mode value
MODE=$(get_trailer_value "Mode")
if [ "$MODE" != "hitl" ] && [ "$MODE" != "autonomous" ]; then
  echo "QAC: agent commit rejected — invalid Mode value: '$MODE'"
  echo "  Mode must be 'hitl' or 'autonomous'"
  exit 1
fi

# Validate no trailer is empty
for trailer in Agent What Why; do
  VALUE=$(get_trailer_value "$trailer")
  if [ -z "$VALUE" ]; then
    echo "QAC: agent commit rejected — trailer '$trailer' is empty"
    exit 1
  fi
done

# Validate trailer order: Agent must come before Mode, Mode before What, What before Why
AGENT_LINE=$(grep -n "^Agent:" "$COMMIT_MSG_FILE" | head -1 | cut -d: -f1)
MODE_LINE=$(grep -n "^Mode:" "$COMMIT_MSG_FILE" | head -1 | cut -d: -f1)
WHAT_LINE=$(grep -n "^What:" "$COMMIT_MSG_FILE" | head -1 | cut -d: -f1)
WHY_LINE=$(grep -n "^Why:" "$COMMIT_MSG_FILE" | head -1 | cut -d: -f1)

if [ -n "$AGENT_LINE" ] && [ -n "$MODE_LINE" ] && [ -n "$WHAT_LINE" ] && [ -n "$WHY_LINE" ]; then
  if [ "$AGENT_LINE" -gt "$MODE_LINE" ] || [ "$MODE_LINE" -gt "$WHAT_LINE" ] || [ "$WHAT_LINE" -gt "$WHY_LINE" ]; then
    echo "QAC: agent commit rejected — trailers must appear in fixed order: Agent, Mode, What, Why"
    exit 1
  fi
fi

exit 0
