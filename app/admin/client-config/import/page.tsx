"use client";

import { useActionState } from "react";
import { importClientConfigCsv, type ImportState } from "./actions";

const initialState: ImportState | null = null;

export default function ImportClientConfigPage() {
  const [state, formAction, pending] = useActionState(importClientConfigCsv, initialState);

  return (
    <div className="page-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">ADMIN · BRONREGISTRATIE</p>
          <h1>Client config importeren</h1>
          <p>Importeer klanten en portefeuilles via CSV. De benchmarkcodes moeten al bestaan in de catalogus.</p>
        </div>
      </div>

      <section className="import-guide">
        <h2>CSV-formaat</h2>
        <pre className="import-example">{`clientName,clientReference,portfolioName,portfolioReference,benchmarkCode
Pensioenfonds Horizon,PF-HOR-001,Rendementsportefeuille,HOR-RP,MSCI-WORLD-NR
Stichting Pensioen Zeker,PF-ZEK-002,Return portefeuille,ZEK-RET,MSCI-ACWI-NR`}</pre>
        <p className="import-note">Eerste rij = kolomkoppen (wordt overgeslagen). <b>benchmarkCode</b> moet exact overeenkomen met een code in de benchmark catalogus.</p>
      </section>

      <form action={formAction} className="import-form">
        <label className="field">
          <span>CSV-data</span>
          <textarea
            name="csv"
            rows={12}
            required
            placeholder="Plak hier de CSV-data..."
            className="import-textarea"
          />
        </label>

        {state && "ok" in state && state.ok && (
          <div className="approval-success" role="alert">
            <b>{state.clients} klant(en) en {state.portfolios} portefeuille(s) geïmporteerd</b>
            {state.warnings.length > 0 && (
              <ul>
                {state.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        )}

        {state && "ok" in state && !state.ok && (
          <div className="form-errors" role="alert">
            <b>Import mislukt</b>
            <ul>
              {state.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="submit-row">
          <button
            className="button button-primary"
            disabled={pending}
            type="submit"
          >
            {pending ? "Bezig met importeren..." : "Importeer client config →"}
          </button>
        </div>
      </form>
    </div>
  );
}
