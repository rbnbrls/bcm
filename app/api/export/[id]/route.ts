import { NextRequest, NextResponse } from "next/server";
import { getChangeRequest } from "@/lib/db";
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
    const format = request.nextUrl.searchParams.get("format");

    if (format !== "csv" && format !== "pdf") {
      return NextResponse.json(
        { error: "Ongeldig exportformaat. Gebruik format=csv of format=pdf." },
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

    const filename = buildExportFilename(changeRequest, format);
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

    // format === "pdf"
    const buffer = await buildPdfBuffer(changeRequest);
    return new NextResponse(buffer, {
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
