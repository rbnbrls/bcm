# Coding Agent Instructions

## Crash/Error Monitoring

All coding agents working in this repository must preserve and extend GlitchTip
coverage whenever they touch runtime code.

- Use `captureError` from `@/lib/sentry-helper` for caught server-side errors in
  API routes, server actions, database helpers, scheduled/background work, and
  best-effort integrations.
- Use `reportError` from `@/lib/error-reporter` when a form/server action should
  both report to GlitchTip and create the existing production GitHub issue.
- Use `reportUserVisibleIssue` from `@/lib/user-visible-issue` when code renders
  a user-facing error, warning, blocked-state, degraded-state, or unavailable
  message without throwing. These messages must be closed-loop GitHub issues too.
- Every API route `catch` that returns a 5xx response must call `captureError`
  with at least `route`, `method`, and `phase`.
- Every server action `catch` that returns an error state, redirects with an
  error, or intentionally swallows a failure must call `captureError` or
  `reportError`, unless the caught error is purely local validation/parsing and
  not an application failure.
- Every client `error.tsx` boundary must render `ErrorBoundaryReporter` from
  `@/components/error-boundary-reporter` with a stable `boundary` name.
- Every GlitchTip/Sentry server-side error captured via `captureError` creates a
  deduplicated GitHub issue in production. Do not bypass `captureError` for
  application failures.
- Silent best-effort failures are only allowed when the failure is genuinely
  expected and non-actionable; otherwise capture them with contextual tags such
  as `endpoint`, `phase`, `changeRequestId`, `workflowVersionId`, or
  `definitionId`.
- Do not send secrets, tokens, full request bodies, or personal data to
  GlitchTip. Prefer stable identifiers, status codes, short messages, and
  bounded excerpts.
