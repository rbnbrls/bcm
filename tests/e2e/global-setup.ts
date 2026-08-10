import type { FullConfig } from "@playwright/test";
import { identitySessionCookie } from "./identity-session";

/**
 * Cold-start warm-up for the Next.js dev server.
 *
 * `next dev` (Turbopack) compiles routes lazily on first request. Playwright's
 * webServer readiness probe only exercises the base URL (/), so the first test
 * that navigates to any other route triggers that route's on-demand compile
 * *while workers are already running*. Under load (workers=2, fullyParallel) a
 * request can hit the dev server mid-compile and come back as the app's 404
 * page ("We kunnen deze pagina niet vinden") even though the route exists —
 * the CI #649 e2e-db-test cold-start flake (15 @db tests 404'd at commit
 * 3a4e551 on a cold runner; all green on the immediate rerun of the same
 * commit, so it was a startup race, not a regression).
 *
 * globalSetup runs after webServer is up but before any worker starts, so
 * warming every route the @db suite touches here moves all on-demand
 * compilation out of the parallel test window. A slow compile then only
 * delays this loop instead of 404ing a spec.
 *
 * Routes are the first-page navigations of the @db specs:
 *   - /admin/client-config        (client-config-edit, client-config-retire)
 *   - /changes/new                (client-onboarding-db, ...-metadata-db,
 *                                  portfolio-configuration-create-db)
 *   - /changes/[id]               (staged-config-change-detail, seeded id)
 *   - /changes                    (changes dashboard, visited by the flows)
 * /admin/* is gated by the identity-aware RBAC proxy, so the admin route is
 * warmed with the same signed identity session used by the specs.
 *
 * The loop retries until each route answers 200 and only logs a warning on
 * exhaustion — a genuinely broken dev server should surface as failing tests
 * (with retries=2 as backstop) rather than as a new hard-fail in globalSetup.
 */

const adminIdentity = identitySessionCookie("admin");
const ADMIN_COOKIE = `${adminIdentity.name}=${adminIdentity.value}`;
const managerIdentity = identitySessionCookie("change_manager");
const MANAGER_COOKIE = `${managerIdentity.name}=${managerIdentity.value}`;

// Seeded by tests/e2e/seed-staged-config-e2e.mjs (runs before Playwright in
// the e2e-db-test job); warms the dynamic /changes/[id] route. Any id would
// compile the route — this one also resolves to a real draft change.
const SEEDED_DRAFT_CHANGE_ID = "00000000-0000-0000-0000-000000000001";

const WARMUP_ROUTES: ReadonlyArray<{ path: string; cookie?: string }> = [
  { path: "/" },
  { path: "/changes" },
  { path: "/changes/new" },
  { path: "/admin/client-config", cookie: ADMIN_COOKIE },
  { path: "/workflow-studio", cookie: MANAGER_COOKIE },
  { path: "/workflow-studio/new", cookie: MANAGER_COOKIE },
  { path: `/changes/${SEEDED_DRAFT_CHANGE_ID}` },
];

const WARMUP_ATTEMPTS = 3;
const WARMUP_TIMEOUT_MS = 30_000;
const WARMUP_RETRY_DELAY_MS = 1_000;

async function warmRoute(
  baseUrl: string,
  route: { path: string; cookie?: string },
): Promise<boolean> {
  const url = `${baseUrl}${route.path}`;
  const headers: Record<string, string> = {
    // Match the browser specs: the app renders server components; a plain
    // fetch is enough to trigger compilation and render.
    "user-agent": "bcm-e2e-warmup",
  };
  if (route.cookie) {
    headers.cookie = route.cookie;
  }

  for (let attempt = 1; attempt <= WARMUP_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
      });
      if (response.status === 200) {
        console.log(`[Playwright] warm-up OK  ${route.path} (attempt ${attempt})`);
        return true;
      }
      console.log(
        `[Playwright] warm-up ${response.status} ${route.path} (attempt ${attempt}/${WARMUP_ATTEMPTS})`,
      );
    } catch (error) {
      console.log(
        `[Playwright] warm-up error ${route.path} (attempt ${attempt}/${WARMUP_ATTEMPTS}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (attempt < WARMUP_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, WARMUP_RETRY_DELAY_MS));
    }
  }
  console.warn(`[Playwright] warm-up FAILED ${route.path} after ${WARMUP_ATTEMPTS} attempts`);
  return false;
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  console.log("[Playwright] E2E tests: using demo fixture data (no DB required)");

  const webServer = config.webServer;
  const baseUrl =
    (typeof webServer === "object" && webServer !== null && webServer.url) ||
    "http://localhost:3000";

  console.log(`[Playwright] warm-up: compiling routes on ${baseUrl} before tests start`);
  for (const route of WARMUP_ROUTES) {
    await warmRoute(baseUrl, route);
  }
}
