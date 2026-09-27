#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# curl-stub.sh — test double for wait-for-deployment.sh's polling loop.
#
# Emulates `curl -s URL -H "Authorization: Bearer ..."` against the Coolify
# deployment API without any network access. Each invocation returns one
# canned JSON response; the responses are consumed in order from
# STUB_RESPONSES_FILE (one JSON document per line). When the file is empty
# or unset, returns {"status":"in_progress"} forever — which exercises the
# polling-until-timeout path.
#
# Usage:
#   STUB_RESPONSES_FILE=/path/to/responses.jsonl ./curl-stub.sh -s URL -H ...
# ──────────────────────────────────────────────────────────────────────────

set -euo pipefail

RESP_FILE="${STUB_RESPONSES_FILE:-}"

if [ -n "${RESP_FILE}" ] && [ -s "${RESP_FILE}" ]; then
  FIRST_LINE="$(head -n 1 "${RESP_FILE}")"
  tail -n +2 "${RESP_FILE}" > "${RESP_FILE}.tmp" && mv "${RESP_FILE}.tmp" "${RESP_FILE}"
  printf '%s\n' "${FIRST_LINE}"
else
  printf '%s\n' '{"status":"in_progress"}'
fi
