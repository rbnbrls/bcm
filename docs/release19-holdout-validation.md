# Release 19 holdout validation

This document records the validation evidence for `rbnbrls/finance-sync` PR #547. All fixtures and load-test inputs were synthetic markers; no provider, account, balance, price, transaction, or other financial data was contacted or used.

## Commands and outcomes

- `PYTHONPATH=src uv run pytest -q` (existing suite): **0**, 3639 passed, 208 skipped, 176 warnings.
- `PYTHONPATH=src uv run pytest -q tests/test_holdout_latest_scenarios.py -vv --tb=short`: **1**, 11 collected, 0 passed, 11 failed; pytest continued through all scenarios.
- Baseline autoscaling load test: **0**; reproducibility comparison: **0**.
- Synthetic overload load test: **0**; controlled rejection used `retry_after`, queue depth 500, duplicate writes 0.

The unprefixed `uv run pytest -q` invocation exits **4** during collection because this checkout requires `PYTHONPATH=src`.

## Holdout verdict

All eight latest holdout scenarios remain **FAIL** on the unmodified PR behavior. The failures identify missing tenant binding, idempotency/write-count observables, outbox recovery evidence, malformed-timing backoff fallback, lease preservation, and controlled dependency-failure diagnostics. The baseline simulator metrics therefore do not establish the required safety guarantees; the result is merge-blocking evidence rather than a claim of production readiness.

The complete hand-written test file and raw logs are retained as task artifacts. No production code was changed as part of this validation.
