#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# wait-for-deployment.test.sh
#
# Unit tests for scripts/wait-for-deployment.sh. Uses a curl stub
# (scripts/tests/curl-stub.sh) so no network access is required.
#
# Run:
#   bash scripts/tests/wait-for-deployment.test.sh
#
# Exit code 0 = all tests pass; non-zero = at least one failure.
# ──────────────────────────────────────────────────────────────────────────

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SCRIPT_DIR}/../wait-for-deployment.sh"
STUB="${SCRIPT_DIR}/curl-stub.sh"

PASS=0
FAIL=0
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

# Fixed paths reused by every run_wait invocation — command substitution
# runs in a subshell, so per-run variables would not propagate to the
# parent; static paths sidestep that.
OUT_FILE="${TMP}/out.txt"
LOG_FILE="${TMP}/log.txt"

# Run the script once with canned responses; prints the exit code.
# $1 = DEPLOY_UUID, $2 = newline-separated responses (may be empty)
run_wait() {
  local uuid="$1"
  local responses="$2"
  local rf="${TMP}/resp.jsonl"
  if [ -n "${responses}" ]; then
    printf '%s\n' "${responses}" > "${rf}"
  fi
  : > "${OUT_FILE}"
  STUB_RESPONSES_FILE="${rf}" \
  CURL_BIN="${STUB}" \
  POLL_INTERVAL=0 \
  MAX_POLLS=3 \
  GITHUB_OUTPUT="${OUT_FILE}" \
  COOLIFY_API_TOKEN="test-token" \
  DEPLOY_UUID="${uuid}" \
  "${SCRIPT}" > "${LOG_FILE}" 2>&1
  echo $?
}

check() {
  local name="$1"
  local condition="$2"
  if eval "${condition}"; then
    PASS=$((PASS + 1))
    echo "  ✅ ${name}"
  else
    FAIL=$((FAIL + 1))
    echo "  ❌ ${name}"
    echo "     last log: ${LOG_FILE}"
  fi
}

# ── 1. Happy path: deployment finishes on the first poll ────────────────
echo "1. Success on first poll"
code=$(run_wait "abc-123" '{"status":"finished"}')
check "exit 0"          "[ \"${code}\" = 0 ]"
check "status=success"  "grep -qx 'status=success' \"${OUT_FILE}\""

# ── 2. Failed deployment fails the job (the false-green bug) ────────────
echo "2. Deployment failed"
code=$(run_wait "abc-123" '{"status":"failed"}')
check "exit 1"          "[ \"${code}\" = 1 ]"
check "status=failed"   "grep -qx 'status=failed' \"${OUT_FILE}\""
check "::error:: logged" "grep -q '::error::' \"${LOG_FILE}\""

# ── 3. Error and cancelled also fail ────────────────────────────────────
echo "3. Deployment errored / cancelled"
code=$(run_wait "abc-123" '{"status":"error"}')
check "exit 1 on error"     "[ \"${code}\" = 1 ]"
check "status=error"        "grep -qx 'status=error' \"${OUT_FILE}\""
code=$(run_wait "abc-123" '{"status":"cancelled"}')
check "exit 1 on cancelled" "[ \"${code}\" = 1 ]"
check "status=cancelled"    "grep -qx 'status=cancelled' \"${OUT_FILE}\""

# ── 4. Transition: in_progress → finished ───────────────────────────────
echo "4. In progress then finished"
code=$(run_wait "abc-123" $'{"status":"in_progress"}\n{"status":"finished"}')
check "exit 0"          "[ \"${code}\" = 0 ]"
check "status=success"  "grep -qx 'status=success' \"${OUT_FILE}\""

# ── 5. Timeout: always in_progress, MAX_POLLS=3 exhausted ───────────────
echo "5. Deployment times out"
code=$(run_wait "abc-123" '')
check "exit 1"              "[ \"${code}\" = 1 ]"
check "status=timed_out"    "grep -qx 'status=timed_out' \"${OUT_FILE}\""
check "timeout message"     "grep -q 'did not finish within timeout' \"${LOG_FILE}\""

# ── 6. Untrackable: no deployment UUID ──────────────────────────────────
echo "6. No deployment UUID (trigger parse failure)"
code=$(run_wait "unknown" '')
check "exit 1"          "[ \"${code}\" = 1 ]"
check "status=unknown"  "grep -qx 'status=unknown' \"${OUT_FILE}\""
check "secret hint"     "grep -q 'COOLIFY_API_TOKEN Actions secret is stale or revoked' \"${LOG_FILE}\""

# ── 7. Trigger-step 401 fail-fast (issue #621): the trigger block in
#       deploy.yml exits 1 when the response contains no deployment UUID,
#       and classifies an auth error (Unauthenticated/401/unauthorized/
#       Invalid token) with an explicit secret-rotation message. The
#       classification predicate is exercised here so a regression in the
#       pattern match fails the suite instead of silently degrading to the
#       generic message in CI. ───────────────────────────────────────────
echo "7. Trigger 401 classification (issue #621)"
# Mirrors the deploy.yml trigger-step predicate: response lowercased, then
# matched against the auth-error patterns (unauthorized is case-insensitive
# because Coolify may return "Unauthorized"; "Invalid token" is matched
# without quotes because the JSON closing quote follows the period).
resp_401='{"message":"Unauthenticated."}'
check "Unauthenticated classified" "printf '%s' '${resp_401}' | tr 'A-Z' 'a-z' | grep -qE 'unauthenticated|401|unauthorized|invalid token'"
resp_401b='{"message":"Invalid token."}'
check "Invalid token classified"   "printf '%s' '${resp_401b}' | tr 'A-Z' 'a-z' | grep -qE 'unauthenticated|401|unauthorized|invalid token'"
resp_401c='{"message":"Unauthorized"}'
check "Unauthorized classified"    "printf '%s' '${resp_401c}' | tr 'A-Z' 'a-z' | grep -qE 'unauthenticated|401|unauthorized|invalid token'"
resp_500='{"message":"Internal Server Error"}'
check "generic not classified"     "! printf '%s' '${resp_500}' | tr 'A-Z' 'a-z' | grep -qE 'unauthenticated|401|unauthorized|invalid token'"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ]
