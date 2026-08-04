#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# wait-for-deployment.sh
#
# Polls the Coolify deployment API until the deployment reaches a terminal
# status, then reports the outcome.
#
# Exits NON-ZERO on every non-success outcome (failed / error / cancelled /
# timed_out / untrackable UUID) so a failed Coolify deployment fails the CI
# job. Previously the deploy workflow treated these with `exit 0`, which
# made the run conclude green while the smoke test was silently skipped
# (observed in CI run #294, commit 765f060).
#
# Usage (from GitHub Actions):
#   COOLIFY_API_TOKEN=... DEPLOY_UUID=... ./scripts/wait-for-deployment.sh
#
# Environment:
#   COOLIFY_API_TOKEN  — Coolify API token (required for real polling)
#   DEPLOY_UUID        — deployment UUID from the trigger step
#   COOLIFY_API_BASE   — Coolify API base URL (default: https://dev.7rb.nl/api/v1)
#   CURL_BIN           — curl binary or stub (default: curl; tests override)
#   MAX_POLLS          — poll attempts (default: 30, ~15 min at 30s)
#   POLL_INTERVAL      — seconds between polls (default: 30; tests use 0)
#   GITHUB_OUTPUT      — file to append status=... to (GitHub Actions only)
#
# Exit codes:
#   0 — deployment finished successfully (status=success emitted)
#   1 — deployment failed/errored/cancelled, timed out, or was untrackable
# ──────────────────────────────────────────────────────────────────────────

set -euo pipefail

COOLIFY_API_BASE="${COOLIFY_API_BASE:-https://dev.7rb.nl/api/v1}"
CURL_BIN="${CURL_BIN:-curl}"
MAX_POLLS="${MAX_POLLS:-30}"
POLL_INTERVAL="${POLL_INTERVAL:-30}"

# Append status=<value> to GITHUB_OUTPUT so downstream steps can gate on it.
# No-op outside GitHub Actions (file absent).
emit_status() {
  local status="$1"
  if [ -n "${GITHUB_OUTPUT:-}" ] && [ -f "${GITHUB_OUTPUT}" ]; then
    echo "status=${status}" >> "${GITHUB_OUTPUT}"
  fi
}

# Fetch the current deployment status from Coolify. Any failure (network,
# non-JSON response, missing status field) degrades to "unknown", which the
# poll loop treats as still-running so transient API errors retry.
fetch_status() {
  "${CURL_BIN}" -s "${COOLIFY_API_BASE}/deployments/${DEPLOY_UUID}" \
    -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null \
    || echo "unknown"
}

# Terminal failure: annotate the run, emit the status, and fail the job.
fail() {
  local status="$1"
  local message="$2"
  echo "::error::${message}"
  emit_status "${status}"
  exit 1
}

if [ -z "${DEPLOY_UUID:-}" ] || [ "${DEPLOY_UUID}" = "unknown" ]; then
  fail "unknown" \
    "No deployment UUID available — the trigger step could not parse one. Failing instead of exiting 0 to avoid a false-green run (the smoke test would be skipped unverified)."
fi

echo "Waiting for deployment ${DEPLOY_UUID} to finish..."
for i in $(seq 1 "${MAX_POLLS}"); do
  STATUS="$(fetch_status)"
  echo "  [${i}/${MAX_POLLS}] Status: ${STATUS}"
  case "${STATUS}" in
    finished|success)
      echo "Deployment finished successfully."
      emit_status "success"
      exit 0
      ;;
    failed|error|cancelled)
      fail "${STATUS}" "Coolify deployment ${STATUS} (UUID ${DEPLOY_UUID})."
      ;;
    *)
      sleep "${POLL_INTERVAL}"
      ;;
  esac
done

fail "timed_out" \
  "Coolify deployment did not finish within timeout (${MAX_POLLS} polls × ${POLL_INTERVAL}s)."
