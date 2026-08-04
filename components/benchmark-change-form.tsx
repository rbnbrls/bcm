"use client";

import { useActionState, useMemo, useState } from "react";
import { createBenchmarkChange, type FormState } from "@/app/changes/new/actions";
import type {
  BenchmarkSwitchPortfolioOption,
  ClientConfigBenchmark,
  ClientConfigClient,
} from "@/lib/types";

type Props = {
  clients: ClientConfigClient[];
  portfolioOptions: BenchmarkSwitchPortfolioOption[];
  benchmarks: ClientConfigBenchmark[];
};

const initialState: FormState = {};

function benchmarkLabel(benchmark: ClientConfigBenchmark): string {
  return benchmark.benchmarkName
    ? `${benchmark.benchmarkCode} — ${benchmark.benchmarkName}`
    : benchmark.benchmarkCode;
}

function rowLabel(row: BenchmarkSwitchPortfolioOption): string {
  return [
    row.portfolioCode,
    row.assetClassName,
    row.subAssetClassName,
    row.managerName,
  ].filter(Boolean).join(" · ");
}

export function BenchmarkChangeForm({ clients, portfolioOptions, benchmarks }: Props) {
  const firstClientCode = clients[0]?.clientCode ?? "";
  const [clientCode, setClientCode] = useState(firstClientCode);
  const [primaryAccountId, setPrimaryAccountId] = useState("");
  const [requestedBenchmarkCode, setRequestedBenchmarkCode] = useState("");
  const [state, formAction, pending] = useActionState(createBenchmarkChange, initialState);

  const rowsForClient = useMemo(
    () => portfolioOptions.filter((row) => row.clientCode === clientCode),
    [clientCode, portfolioOptions],
  );
  const selectedRow = useMemo(
    () => rowsForClient.find((row) => row.primaryAccountId === primaryAccountId) ?? null,
    [primaryAccountId, rowsForClient],
  );
  const availableBenchmarks = useMemo(
    () => benchmarks.filter((benchmark) => benchmark.benchmarkCode !== selectedRow?.benchmarkCode),
    [benchmarks, selectedRow],
  );
  const selectedBenchmark = useMemo(
    () => benchmarks.find((benchmark) => benchmark.benchmarkCode === requestedBenchmarkCode) ?? null,
    [benchmarks, requestedBenchmarkCode],
  );

  function chooseClient(nextClientCode: string) {
    setClientCode(nextClientCode);
    setPrimaryAccountId("");
    setRequestedBenchmarkCode("");
  }

  function choosePortfolio(nextPrimaryAccountId: string) {
    setPrimaryAccountId(nextPrimaryAccountId);
    setRequestedBenchmarkCode("");
  }

  return (
    <form action={formAction} className="change-form">
      <input name="clientCode" type="hidden" value={clientCode} />
      <input name="primaryAccountId" type="hidden" value={primaryAccountId} />
      <input name="requestedBenchmarkCode" type="hidden" value={requestedBenchmarkCode} />

      <section className="form-section">
        <div className="section-number" aria-label="Stap 1">01</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Klant en portefeuille</h2>
            <p>Kies een bestaande klant en actieve portefeuilleconfiguratie.</p>
          </div>
          <label className="field">
            <span>Klant</span>
            <select value={clientCode} onChange={(event) => chooseClient(event.target.value)} required>
              {clients.map((client) => (
                <option key={client.clientCode} value={client.clientCode}>
                  {client.clientName} · {client.clientCode}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Portefeuille</span>
            <select
              value={primaryAccountId}
              onChange={(event) => choosePortfolio(event.target.value)}
              required
            >
              <option value="">Kies portefeuille</option>
              {rowsForClient.map((row) => (
                <option key={row.primaryAccountId} value={row.primaryAccountId}>
                  {rowLabel(row)}
                </option>
              ))}
            </select>
          </label>
          {selectedRow && (
            <div className="portfolio-card is-selected">
              <div className="benchmark-row">
                <div className="benchmark ist">
                  <span>IST</span>
                  <b>{selectedRow.benchmarkCode}</b>
                  <small>{selectedRow.benchmarkName ?? selectedRow.primaryAccountId}</small>
                </div>
                <span className="arrow">→</span>
                <label className="benchmark soll">
                  <span>SOLL</span>
                  <select
                    value={requestedBenchmarkCode}
                    onChange={(event) => setRequestedBenchmarkCode(event.target.value)}
                    required
                    aria-label={`Kies SOLL benchmark voor ${selectedRow.portfolioCode}`}
                  >
                    <option value="">Kies benchmark</option>
                    {availableBenchmarks.map((benchmark) => (
                      <option key={benchmark.benchmarkCode} value={benchmark.benchmarkCode}>
                        {benchmarkLabel(benchmark)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="form-section">
        <div className="section-number" aria-label="Stap 2">02</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Aanvraaggegevens</h2>
            <p>Vul de eigenaar, ingangsdatum en reden van de benchmarkwissel in.</p>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Aanvrager</span>
              <input name="requestedBy" required placeholder="Naam van de contactpersoon" defaultValue="Ruben Verboon" />
            </label>
            <label className="field">
              <span>Gewenste ingangsdatum</span>
              <input name="effectiveDate" required type="date" />
            </label>
          </div>
          <label className="field">
            <span>Reden van de wijziging</span>
            <textarea name="rationale" required minLength={10} placeholder="Bijvoorbeeld: benchmark aanpassen aan het geactualiseerde beleggingsbeleid." />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="section-number" aria-label="Stap 3">03</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Controle</h2>
            <p>Alleen de benchmarkcode wordt gewijzigd; overige configuratievelden blijven gelijk.</p>
          </div>
          <div className="cost-summary-inline">
            <div className="cost-summary-row">
              <span>Portefeuille</span>
              <span>{selectedRow ? rowLabel(selectedRow) : "Nog niet gekozen"}</span>
            </div>
            <div className="cost-summary-row">
              <span>Benchmark</span>
              <span>
                {selectedRow?.benchmarkCode ?? "IST"} → {selectedBenchmark?.benchmarkCode ?? "SOLL"}
              </span>
            </div>
          </div>
          {state.issues && (
            <div className="form-errors" role="alert" aria-live="polite">
              <b>Controleer de aanvraag</b>
              <ul>{state.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
            </div>
          )}
          <div className="submit-row">
            <p><b>{selectedRow?.portfolioCode ?? "Geen portefeuille geselecteerd"}</b></p>
            <button
              className="button button-primary"
              disabled={pending || !selectedRow || !requestedBenchmarkCode}
              type="submit"
            >
              {pending ? "Aanvraag opslaan..." : "Benchmarkwissel aanvragen"}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
