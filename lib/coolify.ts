/**
 * Server-side module for querying the Coolify API.
 *
 * Environment variables used:
 *   COOLIFY_API_TOKEN – Bearer token for Coolify API (required for live status)
 *   COOLIFY_HOST      – Coolify base URL (defaults to http://coolify:8000)
 *   COOLIFY_APP_UUID  – Application UUID to check (defaults to bcm)
 *
 * When COOLIFY_API_TOKEN is not set, the module returns a degraded
 * "unknown" status so the UI degrades gracefully.
 */

import { captureError } from "@/lib/sentry-helper";

const DEFAULT_HOST = "http://coolify:8000";
const DEFAULT_APP_UUID = "fl27k4hn1oh2dqgwd05ukox8";

export type CoolifyStatusLevel = "green" | "amber" | "red" | "unknown";

export interface CoolifyStatus {
  /** Computed health level */
  level: CoolifyStatusLevel;
  /** Raw Coolify status string (e.g. "running:unknown", "running:healthy", "exited") */
  raw: string;
  /** Human-readable label in Dutch */
  label: string;
  /** Whether a deployment/build is in progress */
  deploying: boolean;
}

interface CoolifyApplication {
  status: string | null;
  name?: string;
}

/**
 * Maps a Coolify status string to a traffic-light level.
 */
export function mapStatus(raw: string | null): CoolifyStatus {
  if (!raw) {
    return { level: "unknown", raw: "onbekend", label: "Onbekend", deploying: false };
  }

  const lower = raw.toLowerCase();

  // Active deployment / build in progress
  if (lower.includes("deploying") || lower.includes("building") || lower.includes("in_progress")) {
    return { level: "amber", raw, label: "Bezig met deployen", deploying: true };
  }

  // Exited / stopped / degraded / unhealthy (check BEFORE healthy to avoid
  // "unhealthy" matching "healthy")
  if (lower.includes("exited") || lower.includes("stopped") || lower.includes("degraded") || lower.includes("unhealthy")) {
    return { level: "red", raw, label: "Offline", deploying: false };
  }

  // Healthy / running cleanly
  if (lower.includes("healthy") || lower === "running" || lower === "running:running") {
    return { level: "green", raw, label: "Online", deploying: false };
  }

  // Running but with uncertain health
  if (lower.includes("running:unknown") || lower.includes("unknown") || lower.includes("starting")) {
    return { level: "amber", raw, label: "Stabiel", deploying: false };
  }

  // Catch-all
  return { level: "amber", raw, label: "Onbekend", deploying: false };
}

/**
 * Fetches the current status of the bcm application from Coolify.
 *
 * Returns a degraded "unknown" status when the Coolify API is unreachable
 * or the token is not configured.
 */
export async function getCoolifyStatus(): Promise<CoolifyStatus> {
  const token = process.env.COOLIFY_API_TOKEN;

  if (!token) {
    console.warn(
      "[coolify] COOLIFY_API_TOKEN not set — returning degraded status. " +
        "Set this env var in Coolify to enable live status."
    );
    return { level: "unknown", raw: "unconfigured", label: "Niet geconfigureerd", deploying: false };
  }

  const host = process.env.COOLIFY_HOST ?? DEFAULT_HOST;
  const appUuid = process.env.COOLIFY_APP_UUID ?? DEFAULT_APP_UUID;

  try {
    const response = await fetch(`${host}/api/v1/applications/${appUuid}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      // Allow internal Docker networking calls
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      captureError(new Error(`Coolify API error: ${response.status} ${response.statusText}`), {
        endpoint: "getCoolifyStatus",
        phase: "coolify_api",
        coolifyStatus: response.status,
      });
      return { level: "unknown", raw: `error:${response.status}`, label: "Fout bij ophalen", deploying: false };
    }

    const data: CoolifyApplication = await response.json();
    return mapStatus(data.status);
  } catch (error) {
    captureError(error, { endpoint: "getCoolifyStatus", phase: "coolify_api" });
    return { level: "unknown", raw: "unreachable", label: "Niet bereikbaar", deploying: false };
  }
}
