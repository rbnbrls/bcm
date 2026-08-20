"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { startBenchmarkChange, type BenchmarkChangeFormState } from "./actions";

const initialState: BenchmarkChangeFormState = {
  success: false,
  message: "",
  instanceId: undefined,
  fieldErrors: undefined,
};

// Client component for the form
export function BenchmarkWijzigingStartForm({ workflowId }: { workflowId: string }) {
  const [state, formAction, pending] = useActionState(startBenchmarkChange, initialState);
  const { pending: formPending } = useFormStatus();

  return (
    <>
      {state.success ? (
        <section className="workflow-runtime-confirmation" role="status">
          <p className="eyebrow">AANVRAAG GESTART</p>
          <h2>Workflowinstance aangemaakt</h2>
          <p>{state.message}</p>
          {state.instanceId && (
            <dl>
              <div>
                <dt>Instance-ID</dt>
                <dd>
                  <code>{state.instanceId}</code>
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>In afwachting van goedkeuring</dd>
              </div>
            </dl>
          )}
          <Link className="button button-secondary" href="/change-catalog">
            Terug naar change catalogus
          </Link>
        </section>
      ) : (
        <>
          {!state.success && state.message && (
            <div className="form-errors" role="alert">
              <b>Aanvraag mislukt</b>
              <p>{state.message}</p>
            </div>
          )}
          <form action={formAction} className="benchmark-change-form">
            <div className="form-section">
              <div className="section-number" aria-label="Stap 1">01</div>
              <div className="section-content">
                <div className="section-heading">
                  <h2>Portefeuille selecteren</h2>
                  <p>Selecteer de portefeuille waarvan de benchmark moet worden gewijzigd.</p>
                </div>
                {/* In a real implementation, we would load portfolio options from the database */}
                <div className="field">
                  <label>
                    <span>Portefeuille</span>
                    <select
                      name="primaryAccountId"
                      required
                      disabled={pending || formPending}
                    >
                      <option value="">Selecteer een portefeuille</option>
                      {/* These would be populated dynamically from client-config */}
                      <option value="123456789">Portefeuillevoorbeeld NL00123456789</option>
                      <option value="987654321">Portefeuillevoorbeeld NL00987654321</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-number" aria-label="Stap 2">02</div>
              <div className="section-content">
                <div className="section-heading">
                  <h2>Aanvraaggegevens</h2>
                  <p>
                    Leg vast wie de wijziging aanvraagt, vanaf wanneer deze moet gelden en waarom de
                    benchmark wijzigt.
                  </p>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>
                      <span>Aanvrager</span>
                      <input
                        name="requestedBy"
                        required
                        placeholder="Naam van de contactpersoon"
                        defaultValue="" // Would be filled from identity in real implementation
                        disabled={pending || formPending}
                      />
                    </label>
                  </div>
                  <div className="field">
                    <label>
                      <span>Gewenste ingangsdatum</span>
                      <input
                        name="effectiveDate"
                        required
                        type="date"
                        min="2026-08-21"
                        disabled={pending || formPending}
                      />
                    </label>
                  </div>
                </div>
                <div className="field">
                  <label>
                    <span>Reden van de wijziging</span>
                    <textarea
                      name="rationale"
                      required
                      minLength={10}
                      placeholder="Bijvoorbeeld: benchmark aanpassen aan het geactualiseerde beleggingsbeleid."
                      disabled={pending || formPending}
                    ></textarea>
                  </label>
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-number" aria-label="Stap 3">03</div>
              <div className="section-content">
                <div className="section-heading">
                  <h2>Controle</h2>
                  <p>
                    Controleer uw aanvraag voordat u deze indient.
                  </p>
                </div>
                {/* In a real implementation, we would show a preview of the changes */}
                <div className="git-diff" aria-label="Benchmarkwijziging preview">
                  <div className="diff-file">
                    client-config/123456789.yaml
                  </div>
                  <div className="diff-block">
                    <p className="diff-context">
                      Portfolio: Portefeuillevoorbeeld NL00123456789
                    </p>
                    <div className="diff-line diff-remove">
                      <i>−</i>
                      <code>benchmark_code: NL00123456789</code>
                      <span>Huidige waarde</span>
                    </div>
                    <div className="diff-line diff-add">
                      <i>+</i>
                      <code>benchmark_code: IE00B1XNHC34</code>
                      <span>Nieuwe waarde</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="submit-row">
              <button
                className="button button-primary"
                type="submit"
                disabled={pending || formPending}
              >
                {pending ? "Aanvraag wordt verwerkt..." : "Benchmarkwissel aanvragen"}
              </button>
              <Link
                className="button button-ghost"
                href="/change-catalog"
                aria-disabled={pending || formPending}
              >
                Annuleren
              </Link>
            </div>
          </form>
        </>
      )}
    </>
  );
}
