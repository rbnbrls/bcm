import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  // Sample performance traces: 20% in production, 100% in dev
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  // Session replay: 10% of all sessions, 100% on error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
});
