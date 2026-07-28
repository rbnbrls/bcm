/**
 * API request/query parameter Zod schemas for BCM.
 *
 * Every POST/PATCH/PUT/DELETE endpoint that accepts a JSON body
 * should parse it through one of these schemas. GET endpoints with
 * query parameters should use the query param schemas.
 *
 * @module schemas/api
 */

import { z } from "zod";

// ── /api/changes/[id]/status ────────────────────────────────────────────────────

export const changeStatusUpdateSchema = z.object({
  /** Target status to transition to. Validated dynamically against workflow. */
  status: z.string().min(1, "Status is verplicht."),
  /** Optional name of the person performing the action. */
  userName: z.string().optional(),
});

export type ChangeStatusUpdate = z.infer<typeof changeStatusUpdateSchema>;

// ── /api/changes/[id]/provider-feedback ─────────────────────────────────────────

export const providerFeedbackSchema = z.object({
  /** Name of the service provider who processed the change. */
  userName: z
    .string()
    .trim()
    .min(1, "Vul uw naam in."),
  /** Optional processed date (YYYY-MM-DD). Defaults to today on the server. */
  processedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datumnotatie. Gebruik YYYY-MM-DD.")
    .optional(),
});

export type ProviderFeedback = z.infer<typeof providerFeedbackSchema>;

// ── /api/report-error ───────────────────────────────────────────────────────────

export const errorReportSchema = z.object({
  error: z.object({
    name: z.string().min(1, "Error name is required."),
    message: z.string().min(1, "Error message is required."),
    stack: z.string().optional(),
    componentStack: z.string().optional(),
  }),
  url: z.string().optional(),
  timestamp: z.string().optional(),
});

export type ErrorReport = z.infer<typeof errorReportSchema>;

// ── /api/notification-config (POST) ─────────────────────────────────────────────

export const VALID_STAKEHOLDER_IDS = [
  "eigen_administratie",
  "asset_service_provider",
  "vermogensbeheerder",
  "werkgever",
  "deelnemer",
  "toezichthouder",
  "internal_admin",
] as const;

export const notificationConfigCreateSchema = z.object({
  stakeholder: z.enum(VALID_STAKEHOLDER_IDS, {
    message: `Ongeldige stakeholder. Moet een van de volgende zijn: ${VALID_STAKEHOLDER_IDS.join(", ")}`,
  }),
  channel: z.enum(["webhook", "email"], {
    message: 'Channel moet "webhook" of "email" zijn.',
  }),
  recipient: z.string().min(1, "Recipient is verplicht."),
  isActive: z.boolean().optional().default(true),
  changeRequestId: z.string().uuid().optional().nullable(),
});

export type NotificationConfigCreate = z.infer<
  typeof notificationConfigCreateSchema
>;

// ── /api/notification-config (DELETE query) ─────────────────────────────────────

export const notificationConfigDeleteQuerySchema = z.object({
  id: z.string().uuid("Ongeldig configuratie ID."),
});

// ── /api/ist-update ─────────────────────────────────────────────────────────────

export const istUpdateOutcomeSchema = z.enum([
  "processed",
  "completed",
  "partial",
  "failed",
  "rejected",
]);

export const istUpdateSchema = z.object({
  /** The change request UUID that was processed. */
  changeRequestId: z.string().uuid("Ongeldig change request ID."),
  /** Processing outcome reported by the external system. */
  outcome: istUpdateOutcomeSchema,
  /** Name of the processor. */
  processedBy: z.string().optional().default("asset_servicer"),
  /** Optional actual processed values keyed by field key. */
  resultData: z.record(z.string(), z.unknown()).optional(),
  /** Optional external reference. */
  externalReference: z.string().optional(),
  /** Optional message or notes. */
  message: z.string().optional(),
});

export type ISTUpdate = z.infer<typeof istUpdateSchema>;

// ── /api/portfolio/[id] (PATCH) ─────────────────────────────────────────────────

export const portfolioUpdateSchema = z.object({
  assetClass: z.string().optional(),
  subAssetClass: z.string().optional(),
});

export type PortfolioUpdate = z.infer<typeof portfolioUpdateSchema>;

// ── /api/export/[id] (GET query) ────────────────────────────────────────────────

export const exportQuerySchema = z.object({
  format: z.enum(["csv", "pdf", "audit-pdf"], {
    message:
      'Ongeldig exportformaat. Gebruik format=csv, format=pdf of format=audit-pdf.',
  }),
});

// ── /api/changes (GET query) ────────────────────────────────────────────────────

export const changesListQuerySchema = z.object({
  status: z.string().optional(),
  sla_status: z.enum(["ok", "at_risk", "overdue"]).optional(),
});

// ── /api/notification-log (GET query) ───────────────────────────────────────────

export const notificationLogQuerySchema = z.object({
  change_request_id: z.string().uuid("Ongeldig change request ID."),
});

// ── /api/notification-config (GET query) ────────────────────────────────────────

export const notificationConfigQuerySchema = z.object({
  stakeholder: z.string().optional(),
  change_request_id: z.string().uuid().optional(),
});
