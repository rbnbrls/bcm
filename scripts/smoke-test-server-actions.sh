#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# smoke-test-server-actions.sh
#
# Post-deploy smoke test: runs a Playwright spec against the PRODUCTION
# server to verify no UnrecognizedActionError occurs on server-action-heavy
# pages.
#
# Intended use:
#   - Run after Coolify deployment confirms the new build is live
#   - Can be triggered from CI (deploy job) or manually
#
# Usage:
#   TARGET_URL="https://bcm.7rb.nl" ./scripts/smoke-test-server-actions.sh
#
# Environment:
#   TARGET_URL   — Base URL of the deployed app (default: http://localhost:3000).
#                  The Playwright spec navigates to this URL, so the smoke
#                  test exercises the ACTUAL deployment, not the local
#                  webServer that playwright.config.ts starts for the e2e suite.
#   REPORT_DIR   — Where to save Playwright report (default: smoke-report)
#
# /admin/* auth: proxy.ts gates /admin/* on the bcm_active_role RBAC cookie
# (lib/rbac.ts), not HTTP Basic Auth. The smoke spec sets the admin cookie
# itself (server-action-smoke.spec.ts beforeEach), so no Basic-Auth
# credentials are needed for this smoke test.
#
# ──────────────────────────────────────────────────────────────────────────

set -euo pipefail

TARGET_URL="${TARGET_URL:-http://localhost:3000}"
REPORT_DIR="${REPORT_DIR:-smoke-report}"

echo "🔍 Server-action smoke test"
echo "   Target: ${TARGET_URL}"
echo "   Report: ${REPORT_DIR}"
echo ""

# ── 1. Verify the site is responding ────────────────────────────────────
#
# Capture the HTTP status code and response body instead of a bare
# `curl -sf`: a live-but-degraded app (HTTP 503 with a JSON body, e.g.
# {"status":"degraded","db":"error"}) is NOT "not responding" — curl -f
# fails on any HTTP >= 400 and misreports it as such (CI run #293).

HEALTH_URL="${TARGET_URL}/api/health"
HEALTH_BODY_FILE="$(mktemp)"
trap 'rm -f "${HEALTH_BODY_FILE}"' EXIT

HEALTH_STATUS="$(curl -sS -o "${HEALTH_BODY_FILE}" -w '%{http_code}' "${HEALTH_URL}" 2>/dev/null || true)"
HEALTH_BODY="$(cat "${HEALTH_BODY_FILE}" 2>/dev/null || true)"

if [ "${HEALTH_STATUS}" = "000" ] || [ -z "${HEALTH_STATUS}" ]; then
  echo "❌ Target ${HEALTH_URL} is unreachable (connection failed). Is the app deployed?"
  echo "   ${HEALTH_BODY}"
  exit 1
fi

if [ "${HEALTH_STATUS}" -lt 200 ] || [ "${HEALTH_STATUS}" -ge 300 ]; then
  echo "❌ Target ${HEALTH_URL} is unhealthy — HTTP ${HEALTH_STATUS}"
  if [ -n "${HEALTH_BODY}" ]; then
    echo "   Response body: ${HEALTH_BODY}"
  fi
  exit 1
fi

echo "✅ Target is healthy (HTTP ${HEALTH_STATUS})"

# ── 2. Run Playwright smoke spec ────────────────────────────────────────

npx playwright test \
  --config=playwright.config.ts \
  --grep "server-action smoke" \
  --reporter=html,line \
  --output="${REPORT_DIR}" \
  2>&1

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "✅ Server-action smoke test PASSED — no UnrecognizedActionError detected"
else
  echo ""
  echo "❌ Server-action smoke test FAILED — see ${REPORT_DIR}/index.html for details"
fi

exit $EXIT_CODE