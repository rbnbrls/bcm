"use client";

import { useActionState } from "react";
import { importBenchmarksCsv, type ImportState } from "./actions";

const initialState: ImportState | null = null;

export default function ImportBenchmarksPage() {
  const [state, formAction, pending] = useActionState(importBenchmarksCsv, initialState);

  return (
    <div className="page-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">ADMIN · CATALOGUS</p>
          <h1>Benchmarks importeren</h1>
          <p>Importeer benchmarks via CSV. Bestaande benchmarks met dezelfde code worden overschreven.</p>
        </div>
      </div>

      <section className="import-guide">
        <h2>CSV-formaat</h2>
        <pre className="import-example">{`code,naam,assetClass,valuta,kosten,provider
MSCI-WORLD-NR,MSCI World Net Return,Aandelen,EUR,1000,MSCI
BLOOMBERG-EU-AGG,Bloomberg Euro Aggregate,Obligaties,EUR,1000,Bloomberg`}</pre>
        <p className="import-note">Eerste rij = kolomkoppen (wordt overgeslagen). Decimalen met punt (bijv. 1500.50). Valuta: EUR, USD of GBP.</p>
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
            <b>{state.inserted} benchmarks geïmporteerd</b>
            {state.skipped > 0 && <p>{state.skipped} overgeslagen (code-conflict of fout).</p>}
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
            {pending ? "Bezig met importeren..." : "Importeer benchmarks →"}
          </button>
        </div>
      </form>
    </div>
  );
}
