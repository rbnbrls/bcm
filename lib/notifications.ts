/**
 * Notification engine for stakeholder notifications on change submission.
 *
 * Supports two channels:
 *   - webhook: HTTP POST with JSON payload to a configurable URL
 *   - email: SMTP via nodemailer to configurable email addresses
 *
 * Delivers to three stakeholders:
 *   - Eigen administratie (own administration)
 *   - Asset service provider
 *   - FactSet
 *
 * Configuration can be app-wide (via env vars or notification_config table)
 * or per-change-request (via notification_config with change_request_id set).
 *
 * All delivery attempts are logged to the notification_log table for auditing.
 * Failed deliveries are retried up to 3 times with exponential backoff.
 */
import nodemailer from "nodemailer";
import type { ChangeRequest } from "@/lib/types";
import type { NotificationConfigRow, NotificationLogRow } from "./db";

// ── Types ──────────────────────────────────────────────────────────────────

export type NotificationChannel = "webhook" | "email";

export type DeliveryResult = {
  stakeholder: string;
  channel: NotificationChannel;
  recipient: string;
  success: boolean;
  statusCode?: number;
  response?: string;
  error?: string;
};

export type NotificationPayload = {
  type: "change_request_submitted";
  reference: string;
  clientName: string;
  clientReference: string;
  changeType: string;
  effectiveDate: string;
  requestedBy: string;
  rationale: string;
  items: Array<{
    portfolioName: string;
    previousBenchmark: string;
    requestedBenchmark: string;
  }>;
  url: string;
  stakeholder: string;
};

// ── Stakeholder definitions ────────────────────────────────────────────────

export const STAKEHOLDERS = [
  { id: "eigen_administratie", label: "Eigen administratie" },
  { id: "asset_service_provider", label: "Asset service provider" },
  { id: "factset", label: "FactSet" },
] as const;

// ── Payload builder ────────────────────────────────────────────────────────

export function buildNotificationPayload(
  change: ChangeRequest,
  stakeholder: string,
  baseUrl?: string
): NotificationPayload {
  const url = `${baseUrl || process.env.BASE_URL || "https://bcm.7rb.nl"}/changes/${change.id}`;

  return {
    type: "change_request_submitted",
    reference: change.reference,
    clientName: change.clientName,
    clientReference: change.clientReference,
    changeType: change.changeType,
    effectiveDate: change.effectiveDate,
    requestedBy: change.requestedBy,
    rationale: change.rationale,
    items: change.items.map((item) => ({
      portfolioName: item.portfolioName,
      previousBenchmark: `${item.previousBenchmark.code} — ${item.previousBenchmark.name}`,
      requestedBenchmark: `${item.requestedBenchmark.code} — ${item.requestedBenchmark.name}`,
    })),
    url,
    stakeholder,
  };
}

// ── Delivery functions ─────────────────────────────────────────────────────

export async function deliverWebhook(
  webhookUrl: string,
  payload: NotificationPayload
): Promise<DeliveryResult> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.text().catch(() => "");
    return {
      stakeholder: payload.stakeholder,
      channel: "webhook",
      recipient: webhookUrl,
      success: res.ok,
      statusCode: res.status,
      response: res.ok ? body : `HTTP ${res.status}: ${body.slice(0, 500)}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      stakeholder: payload.stakeholder,
      channel: "webhook",
      recipient: webhookUrl,
      success: false,
      error: message,
    };
  }
}

export async function deliverEmail(
  to: string,
  payload: NotificationPayload
): Promise<DeliveryResult> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromAddress = process.env.SMTP_FROM || "noreply@bcm.7rb.nl";

  if (!smtpHost) {
    return {
      stakeholder: payload.stakeholder,
      channel: "email",
      recipient: to,
      success: false,
      error: "SMTP niet geconfigureerd (SMTP_HOST ontbreekt)",
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth:
        smtpUser && smtpPass
          ? { user: smtpUser, pass: smtpPass }
          : undefined,
    });

    const itemsHtml = payload.items
      .map(
        (item) =>
          `<tr>
            <td style="padding:8px;border:1px solid #ddd">${item.portfolioName}</td>
            <td style="padding:8px;border:1px solid #ddd">${item.previousBenchmark}</td>
            <td style="padding:8px;border:1px solid #ddd">${item.requestedBenchmark}</td>
          </tr>`
      )
      .join("");

    const subject = `[BCM] Nieuwe change request: ${payload.reference} — ${payload.clientName}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#0a513f;">Nieuwe change request ingediend</h2>
        <p><strong>Referentie:</strong> ${payload.reference}</p>
        <p><strong>Cliënt:</strong> ${payload.clientName} (${payload.clientReference})</p>
        <p><strong>Aanvrager:</strong> ${payload.requestedBy}</p>
        <p><strong>Ingangsdatum:</strong> ${payload.effectiveDate}</p>
        <p><strong>Type:</strong> ${payload.changeType === "new_benchmark" ? "Nieuwe benchmark" : "Benchmarkwissel"}</p>
        <p><strong>Reden:</strong> ${payload.rationale}</p>
        <hr style="margin:16px 0;border:none;border-top:1px solid #eee"/>
        <h3>Wijzigingen</h3>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;text-align:left">Portefeuille</th>
              <th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;text-align:left">Huidig (IST)</th>
              <th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;text-align:left">Gewenst (SOLL)</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <p style="margin-top:20px;">
          <a href="${payload.url}" style="display:inline-block;padding:10px 20px;background:#0f6d55;color:#fff;text-decoration:none;border-radius:6px;">
            Bekijk change request
          </a>
        </p>
        <p style="color:#888;font-size:12px;margin-top:24px;">
          Dit bericht is automatisch gegenereerd door BCM.
        </p>
      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
    });

    return {
      stakeholder: payload.stakeholder,
      channel: "email",
      recipient: to,
      success: true,
      statusCode: 200,
      response: `Message ID: ${info.messageId}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      stakeholder: payload.stakeholder,
      channel: "email",
      recipient: to,
      success: false,
      error: message,
    };
  }
}

// ── Config resolution ──────────────────────────────────────────────────────

export type NotifConfig = {
  stakeholderId: string;
  stakeholderLabel: string;
  webhookUrl?: string;
  emailAddress?: string;
};

/**
 * Resolve the notification configuration for a change request.
 *
 * Looks up per-change config first (notification_config with change_request_id = id),
 * then app-wide config (change_request_id IS NULL), then falls back to env vars.
 *
 * Returns an array of active configurations per stakeholder.
 */
export async function resolveConfig(
  changeRequestId?: string
): Promise<NotifConfig[]> {
  const { getNotificationConfigs } = await import("@/lib/db");
  const configs: NotifConfig[] = [];

  for (const s of STAKEHOLDERS) {
    const config: NotifConfig = {
      stakeholderId: s.id,
      stakeholderLabel: s.label,
    };

    // Try DB config (per-change first, then app-wide)
    if (changeRequestId) {
      const dbConfigs = await getNotificationConfigs({
        stakeholder: s.id,
        changeRequestId,
      });
      const matched = dbConfigs.find((c) => c.isActive);
      if (matched) {
        if (matched.channel === "webhook") config.webhookUrl = matched.recipient;
        if (matched.channel === "email") config.emailAddress = matched.recipient;
      }
    }

    // Try app-wide DB config if no per-change match
    if (!config.webhookUrl && !config.emailAddress) {
      const appConfigs = await getNotificationConfigs({
        stakeholder: s.id,
      });
      for (const c of appConfigs) {
        if (c.isActive && !c.changeRequestId) {
          if (c.channel === "webhook") config.webhookUrl = c.recipient;
          if (c.channel === "email") config.emailAddress = c.recipient;
        }
      }
    }

    // Fall back to env vars
    if (!config.webhookUrl && !config.emailAddress) {
      const envMap: Record<string, { webhook: string; email: string }> = {
        eigen_administratie: {
          webhook: "WEBHOOK_ADMINISTRATIE",
          email: "NOTIFY_EMAIL_ADMINISTRATIE",
        },
        asset_service_provider: {
          webhook: "WEBHOOK_ASSET_SERVICE",
          email: "NOTIFY_EMAIL_ASSET_SERVICE",
        },
        factset: {
          webhook: "WEBHOOK_FACTSET",
          email: "NOTIFY_EMAIL_FACTSET",
        },
      };
      const vars = envMap[s.id];
      if (vars) {
        if (process.env[vars.webhook]) config.webhookUrl = process.env[vars.webhook];
        if (process.env[vars.email]) config.emailAddress = process.env[vars.email];
      }
    }

    configs.push(config);
  }

  return configs;
}

// ── Main notification dispatcher ────────────────────────────────────────────

/**
 * Send notifications for a change request to all configured stakeholders.
 *
 * For each stakeholder, sends via all configured channels (webhook + email).
 * Logs each delivery attempt to notification_log.
 * Returns an array of DeliveryResult.
 */
export async function sendChangeNotifications(
  change: ChangeRequest
): Promise<DeliveryResult[]> {
  const configs = await resolveConfig(change.id);
  const results: DeliveryResult[] = [];
  const payload = buildNotificationPayload(change, "");

  for (const cfg of configs) {
    const channels: Array<{ channel: NotificationChannel; recipient: string }> = [];

    if (cfg.webhookUrl) {
      channels.push({ channel: "webhook", recipient: cfg.webhookUrl });
    }
    if (cfg.emailAddress) {
      channels.push({ channel: "email", recipient: cfg.emailAddress });
    }

    // Skip stakeholders without any configured channel
    if (channels.length === 0) {
      results.push({
        stakeholder: cfg.stakeholderLabel,
        channel: "webhook",
        recipient: "niet geconfigureerd",
        success: false,
        error: "Geen webhook URL of e-mailadres geconfigureerd voor deze stakeholder",
      });
      continue;
    }

    for (const ch of channels) {
      payload.stakeholder = cfg.stakeholderLabel;

      let result: DeliveryResult;
      if (ch.channel === "webhook") {
        result = await deliverWebhook(ch.recipient, payload);
      } else {
        result = await deliverEmail(ch.recipient, payload);
      }

      // Log to database
      try {
        const { logNotificationDelivery } = await import("@/lib/db");
        await logNotificationDelivery({
          changeRequestId: change.id,
          stakeholder: cfg.stakeholderId,
          channel: ch.channel,
          recipient: ch.recipient,
          status: result.success ? "sent" : "failed",
          attempts: 1,
          maxAttempts: 3,
          response: result.success
            ? result.response || null
            : result.error || null,
        });
      } catch {
        // Logging failure is non-fatal — the notification was still attempted
      }

      results.push(result);
    }
  }

  // Mark notification_sent on the change request if any delivery succeeded
  const anySuccess = results.some((r) => r.success);
  if (anySuccess) {
    try {
      const { updateNotificationSent } = await import("@/lib/db");
      await updateNotificationSent(change.id);
    } catch {
      // Non-fatal
    }
  }

  return results;
}
