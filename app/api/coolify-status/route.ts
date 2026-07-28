import { NextResponse } from "next/server";
import { getCoolifyStatus } from "@/lib/coolify";
import { captureError } from "@/lib/sentry-helper";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getCoolifyStatus();

    return NextResponse.json({ status });
  } catch (error) {
    captureError(error, { route: "/api/coolify-status", method: "GET", phase: "request" });
    const message =
      error instanceof Error ? error.message : "Onbekende fout bij ophalen Coolify status";

    return NextResponse.json(
      {
        error: message,
        status: { level: "unknown", raw: "error", label: "Fout", deploying: false },
      },
      { status: 502 }
    );
  }
}
