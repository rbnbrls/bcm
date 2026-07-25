import { NextRequest, NextResponse } from "next/server";
import { getChangeRequest, getAuditLogs, getApprovals } from "@/lib/db";
import {
  buildCsvContent,
  buildExportFilename,
  CONTENT_TYPE_CSV,
  CONTENT_TYPE_PDF,
} from "@/lib/export";
import { buildPdfBuffer } from "@/lib/export-pdf";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");

    if (format !== "csv" && format !== "pdf" && format !== "audit-pdf") {
      return NextResponse.json(
        { error: "Ongeldig exportformaat. Gebruik format=csv, format=pdf of format=audit-pdf." },
        { status: 400 }
      );
    }

    const changeRequest = await getChangeRequest(id);
    if (!changeRequest) {
      return NextResponse.json(
        { error: "Change request niet gevonden." },
        { status: 404 }
      );
    }

    const filename = buildExportFilename(changeRequest, format === "audit-pdf" ? "pdf" : format);
    const disposition = `attachment; filename="${filename}"`;

    if (format === "csv") {
      const content = buildCsvContent(changeRequest);
      return new NextResponse(content, {
        status: 200,
        headers: {
          "Content-Type": CONTENT_TYPE_CSV,
          "Content-Disposition": disposition,
        },
      });
    }

    if (format === "audit-pdf") {
      // Enhanced audit PDF with full trail and approvals
      const [auditLogs, approvals] = await Promise.all([
        getAuditLogs(id),
        getApprovals(id),
      ]);
      const buffer = await buildPdfBuffer(changeRequest, auditLogs, approvals);
      const contentDisposition = `attachment; filename="${changeRequest.reference}-audit-record.pdf"`;
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": CONTENT_TYPE_PDF,
          "Content-Disposition": contentDisposition,
        },
      });
    }

    // format === "pdf" — standard PDF without audit trail
    const buffer = await buildPdfBuffer(changeRequest);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPE_PDF,
        "Content-Disposition": disposition,
      },
    });
  } catch (error) {
    console.error("GET /api/export/[id] error:", error);
    return NextResponse.json(
      { error: "Export mislukt." },
      { status: 500 }
    );
  }
}
