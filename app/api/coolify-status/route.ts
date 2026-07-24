import { NextResponse } from "next/server";
import { getCoolifyStatus } from "@/lib/coolify";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getCoolifyStatus();

    return NextResponse.json({ status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Onbekende fout bij ophalen Coolify status";
    console.error("GET /api/coolify-status error:", error);

    return NextResponse.json(
      {
        error: message,
        status: { level: "unknown", raw: "error", label: "Fout", deploying: false },
      },
      { status: 502 }
    );
  }
}
