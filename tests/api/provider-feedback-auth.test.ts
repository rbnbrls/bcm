/**
 * Tests for POST /api/changes/[id]/provider-feedback — the endpoint that
 * transitions a change to 'processed' and applies it to the live benchmark
 * configuration (IST sync).
 *
 * Regression test for kanban task t_92eec771: the route previously had NO
 * authorization check — any caller with a change ID (including viewer /
 * unauthenticated requests) could drive a change to 'processed' and silently
 * mutate benchmark data. It must now require the change type's approve
 * permission (changes:approve), the same gate as the 'accepted' transition.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockUpdateChangeStatus = vi.fn();
const mockGetChangeRequest = vi.fn();
const mockRequirePermission = vi.fn();
const mockGetChangeTypePermission = vi.fn();
const mockCaptureError = vi.fn();

vi.mock("@/lib/db", () => ({
  updateChangeStatus: mockUpdateChangeStatus,
  getChangeRequest: mockGetChangeRequest,
}));
vi.mock("@/lib/sentry-helper", () => ({
  captureError: mockCaptureError,
}));
vi.mock("@/lib/rbac-request", () => ({
  requirePermission: mockRequirePermission,
}));
vi.mock("@/lib/change-type-registry", () => ({
  getChangeTypePermission: mockGetChangeTypePermission,
}));

const CHANGE_ID = "ed43f19d-cf4d-461e-9fef-ce8cf5da294f";
const REQUEST_URL = `http://localhost:3000/api/changes/${CHANGE_ID}/provider-feedback`;

async function post(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/changes/[id]/provider-feedback/route");
  const request = new Request(REQUEST_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // The route signature is NextRequest; a plain Request satisfies the parts
  // the handler uses (json(), headers), matching how other route tests call
  // handlers with a minimal Request.
  return POST(request as unknown as Parameters<typeof POST>[0], { params: Promise.resolve({ id: CHANGE_ID }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetChangeTypePermission.mockReturnValue("changes:approve");
  mockGetChangeRequest.mockResolvedValue({
    id: CHANGE_ID,
    reference: "WF-2026-TEST",
    changeType: "benchmark_switch",
    status: "in_progress",
  });
  mockRequirePermission.mockResolvedValue({
    authorized: true,
    role: "account_manager",
    label: "Account manager",
    identity: { userId: "e2e:account_manager" },
  });
  mockUpdateChangeStatus.mockResolvedValue(CHANGE_ID);
});

describe("POST /api/changes/[id]/provider-feedback — authorization", () => {
  it("denies unauthorized identities with 403 before mutating anything", async () => {
    mockRequirePermission.mockResolvedValue({
      authorized: false,
      role: "viewer",
      label: "Viewer",
      message: "Alleen een Account manager kan changes goedkeuren of afwijzen.",
    });

    const response = await post({ userName: "Vera Viewer" });

    expect(response.status).toBe(403);
    expect(mockUpdateChangeStatus).not.toHaveBeenCalled();
  });

  it("requires the change type's approve permission", async () => {
    await post({ userName: "Arjan Accountmanager" });

    expect(mockGetChangeTypePermission).toHaveBeenCalledWith("benchmark_switch", "approve");
    expect(mockRequirePermission).toHaveBeenCalledWith("changes:approve", expect.anything());
  });

  it("allows an authorized account manager to process the change", async () => {
    const response = await post({ userName: "Arjan Accountmanager" });

    expect(response.status).toBe(200);
    expect(mockUpdateChangeStatus).toHaveBeenCalledWith(CHANGE_ID, "processed", "Arjan Accountmanager");
  });
});
