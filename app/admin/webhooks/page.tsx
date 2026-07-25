"use client";

import { useActionState, useState, useEffect } from "react";
import { createWebhook, removeWebhook, listWebhooks, type WebhookState } from "./actions";
import type { WebhookConfig } from "@/lib/types";

const EVENTS = [
  { value: "change.approved", label: "Change goedgekeurd" },
  { value: "change.rejected", label: "Change afgewezen" },
];

const initialState: WebhookState | null = null;

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, formAction, pending] = useActionState(createWebhook, initialState);

  useEffect(() => {
    listWebhooks().then((whs) => {
      setWebhooks(whs);
      setLoading(false);
    });
  }, [state]);

  const handleRemove = async (id: string) => {
    const result = await removeWebhook(id);
    if (result.ok) {
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    }
  };

  return (
    <div className="page-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">ADMIN · INTEGRATIES</p>
          <h1>Webhooks</h1>
          <p>Stuur notificaties naar externe systemen (asset servicer, FactSet) bij goedgekeurde of afgewezen changes.</p>
        </div>
      </div>

      {/* Existing webhooks */}
      <section className="webhook-list">
        <h2>Actieve webhooks</h2>
        {loading ? (
          <p>Laden...</p>
        ) : webhooks.length === 0 ? (
          <div className="empty-state">
            <p>Nog geen webhooks geconfigureerd. Voeg er hieronder één toe.</p>
          </div>
        ) : (
          <div className="webhook-cards">
            {webhooks.map((wh) => (
              <div key={wh.id} className={`webhook-card ${wh.active ? "" : "webhook-card--inactive"}`}>
                <div className="webhook-card-header">
                  <b>{wh.name}</b>
                  <span className={`status-pill status-pill--${wh.active ? "active" : "inactive"}`}>
                    {wh.active ? "Actief" : "Inactief"}
                  </span>
                </div>
                <code className="webhook-url">{wh.url}</code>
                <div className="webhook-events">
                  {wh.events.map((evt) => (
                    <span key={evt} className="event-tag">{evt}</span>
                  ))}
                </div>
                <button
                  className="button button-danger button-small"
                  onClick={() => handleRemove(wh.id)}
                >
                  Verwijderen
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add new webhook */}
      <section className="webhook-add">
        <h2>Nieuwe webhook</h2>
        <form action={formAction} className="webhook-form">
          <div className="form-row">
            <label className="field">
              <span>Naam</span>
              <input name="name" required minLength={2} placeholder="Bijv. Asset servicer" />
            </label>
            <label className="field">
              <span>URL</span>
              <input name="url" required type="url" placeholder="https://api.voorbeeld.nl/webhook" />
            </label>
          </div>
          <label className="field">
            <span>Geheim (optioneel)</span>
            <input name="secret" type="text" placeholder="X-Webhook-Secret waarde" />
          </label>
          <fieldset className="field field-checkboxes">
            <span>Events</span>
            <div className="checkbox-group">
              {EVENTS.map((evt) => (
                <label key={evt.value} className="checkbox-label">
                  <input type="checkbox" name="events" value={evt.value} defaultChecked />
                  {evt.label}
                </label>
              ))}
            </div>
          </fieldset>

          {state && "ok" in state && state.ok && (
            <div className="approval-success" role="alert">
              <b>{state.message}</b>
            </div>
          )}
          {state && "ok" in state && !state.ok && (
            <div className="form-errors" role="alert">
              <b>{state.message}</b>
            </div>
          )}

          <div className="submit-row">
            <button className="button button-primary" disabled={pending} type="submit">
              {pending ? "Bezig..." : "Webhook toevoegen →"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
