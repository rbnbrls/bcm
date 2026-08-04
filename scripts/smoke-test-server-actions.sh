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
#   TARGET_URL   — Base URL of the deployed app (default: http://localhost:3000)
#   REPORT_DIR   — Where to save Playwright report (default: smoke-report)
#   ADMIN_USER   — HTTP Basic-Auth user for /admin/* (proxy.ts). Required
#                  when TARGET_URL is production; must match the deployed
#                  ADMIN_USER. Falls back to Playwright's default creds.
#   ADMIN_PASSWORD — HTTP Basic-Auth password for /admin/* (see ADMIN_USER).
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

if ! curl -sf "${TARGET_URL}/api/health" > /dev/null 2>&1; then
  echo "❌ Target ${TARGET_URL}/api/health is not responding. Is the app deployed?"
  exit 1
fi
echo "✅ Target is healthy"

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