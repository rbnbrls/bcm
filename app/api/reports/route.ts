import { NextRequest, NextResponse } from "next/server";
import { getAllChangeRequestsFull } from "@/lib/db";
import {
  buildProcessingTimeReport, buildCostReport, buildDashboardSummary,
  aggregateClientVolume, aggregateMonthlyVolume, filterReports, exportToCSV,
} from "@/lib/reports";
import type { ReportFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_TYPES = [
  "dashboard", "processing-time", "doorlooptijd",
  "cost", "kosten", "volume", "monthly-volume",
] as const;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "dashboard";
    const format = request.headers.get("accept") ?? "application/json";

    if (!VALID_TYPES.includes(type as any) && type !== "dashboard") {
      return NextResponse.json(
        { error: `Invalid report type: "${type}". Valid types: ${VALID_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    const changes = await getAllChangeRequestsFull();

    const filters: ReportFilters = {
      clientId: searchParams.get("clientId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      changeType: searchParams.get("changeType") ?? undefined,
    };

    let data: unknown;

    switch (type) {
      case "doorlooptijd":
      case "processing-time": {
        const report = buildProcessingTimeReport(changes);
        data = filterReports(report, filters);
        break;
      }
      case "cost":
      case "kosten": {
        const report = buildCostReport(changes);
        data = filterReports(report, filters);
        break;
      }
      case "volume": {
        const report = aggregateClientVolume(changes);
        // ClientVolumeReport lacks createdAt/status/changeType, so filter clientId manually
        if (filters.clientId) {
          data = report.filter((r) => r.clientId === filters.clientId);
        } else {
          data = report;
        }
        break;
      }
      case "monthly-volume": {
        data = aggregateMonthlyVolume(changes);
        break;
      }
      case "dashboard":
      default: {
        data = buildDashboardSummary(changes);
        break;
      }
    }

    if (format === "text/csv") {
      const arr = Array.isArray(data) ? data : [];
      const fields = arr.length > 0 ? Object.keys(arr[0]) : [];
      const csv = exportToCSV(arr, fields);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="report-${type}.csv"`,
        },
      });
    }

    return NextResponse.json({
      type,
      count: Array.isArray(data) ? data.length : 1,
      data,
    });
  } catch (error) {
    console.error("[API] /api/reports error:", error);
    return NextResponse.json(
      { error: "Internal server error", type: "dashboard", count: 0, data: null },
      { status: 500 },
    );
  }
}
