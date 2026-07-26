"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Inline provider feedback form used on the change detail page.
 * Submits via the provider-feedback API endpoint and triggers IST sync.
 */
export function ProviderDetailFeedbackForm({
  changeId,
}: {
  changeId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [userName, setUserName] = useState("");
  const [processedDate, setProcessedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [message, setMessage] = useState<{
    success: boolean;
    text: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) {
      setMessage({ success: false, text: "Vul uw naam in." });
      return;
    }

    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/changes/${changeId}/provider-feedback`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userName: userName.trim(),
              processedDate,
            }),
          }
        );
        const data = await res.json();
        if (res.ok && data.success) {
          setMessage({
            success: true,
            text: data.message || "Change verwerkt.",
          });
          router.refresh();
        } else {
          setMessage({
            success: false,
            text: data.error || "Verwerken mislukt.",
          });
        }
      } catch {
        setMessage({
          success: false,
          text: "Netwerkfout bij het verwerken.",
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 180, flex: 1 }}>
          <label
            htmlFor={`detail-name-${changeId}`}
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 750,
              color: "#926d0a",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              marginBottom: 4,
            }}
          >
            Uw naam
          </label>
          <input
            id={`detail-name-${changeId}`}
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Naam medewerker"
            required
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #c8950c",
              borderRadius: 8,
              background: "#fff",
              font: "inherit",
              fontSize: 13,
              color: "var(--ink)",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ minWidth: 160 }}>
          <label
            htmlFor={`detail-date-${changeId}`}
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 750,
              color: "#926d0a",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              marginBottom: 4,
            }}
          >
            Verwerkingsdatum
          </label>
          <input
            id={`detail-date-${changeId}`}
            type="date"
            value={processedDate}
            onChange={(e) => setProcessedDate(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #c8950c",
              borderRadius: 8,
              background: "#fff",
              font: "inherit",
              fontSize: 13,
              color: "var(--ink)",
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          style={{
            padding: "8px 20px",
            background: isPending ? "var(--muted)" : "#2e7d32",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            font: "inherit",
            fontSize: 13,
            fontWeight: 700,
            cursor: isPending ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
            transition: "background .15s",
          }}
        >
          {isPending ? "Bezig…" : "Verwerken & IST sync"}
        </button>
      </div>

      {message && (
        <div
          role="alert"
          style={{
            marginTop: 10,
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 600,
            background: message.success ? "#dff4e9" : "#fff0ed",
            color: message.success ? "#0f6d55" : "#a44032",
            border: `1px solid ${message.success ? "#0f6d55" : "#a44032"}`,
          }}
        >
          {message.text}
        </div>
      )}
    </form>
  );
}
