import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/workflow-runtime", request.url), 307);
}
