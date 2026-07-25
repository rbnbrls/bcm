"use client";

import { useActionState, useMemo, useState } from "react";
import { createBenchmarkChange, type FormState } from "@/app/changes/new/actions";
import type { Benchmark, ClientConfig } from "@/lib/types";

type Props = { clients: ClientConfig[]; benchmarks: Benchmark[] };
const initialState: FormState = {};

const NEW_BENCHMARK_VALUE = "__NEW__";
const ASSET_CLASS_OPTIONS = [
  "Aandelen",
  "Obligaties",
  "Vastgoed",
  "Alternatieven",
  "Liquiditeiten",
  "Private Equity",
  "Infrastructure",
  "Grondstoffen",
];

export function BenchmarkChangeForm({ clients, benchmarks }: Props) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [newBenchmarkDetails, setNewBenchmarkDetails] = useState<Record<string, { shortName: string; longName: string; assetClass: string }>>({});
  const [state, formAction, pending] = useActionState(createBenchmarkChange, initialState);
  const client = useMemo(() => clients.find((candidate) => candidate.id === clientId), [clientId, clients]);
  const selectedPortfolios = client?.portfolios.filter((portfolio) => selectedIds.includes(portfolio.id)) ?? [];

  // Split items into existing-benchmark switches and new-benchmark requests
  const switchItems = selectedPortfolios
    .filter((p) => targets[p.id] && targets[p.id] !== NEW_BENCHMARK_VALUE)
    .map((portfolio) => ({
      portfolioId: portfolio.id,
      previousBenchmarkId: portfolio.currentBenchmarkId,
      requestedBenchmarkId: targets[portfolio.id],
    }));

  const newBenchmarkItems = selectedPortfolios
    .filter((p) => targets[p.id] === NEW_BENCHMARK_VALUE)
    .map((portfolio) => ({
      portfolioId: portfolio.id,
      previousBenchmarkId: portfolio.currentBenchmarkId,
      details: newBenchmarkDetails[portfolio.id] ?? { shortName: "", longName: "", assetClass: "" },
    }));

  const totalSwitchPortfolios = switchItems.length + newBenchmarkItems.length;

  function chooseClient(nextId: string) { setClientId(nextId); setSelectedIds([]); setTargets({}); setNewBenchmarkDetails({}); }
  function togglePortfolio(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((portfolioId) => portfolioId !== id) : [...current, id]);
  }
  function setTarget(portfolioId: string, benchmarkId: string) {
    setTargets((current) => ({ ...current, [portfolioId]: benchmarkId }));
  }
  function setNewDetail(portfolioId: string, field: keyof (typeof newBenchmarkDetails)[string], value: string) {
    setNewBenchmarkDetails((current) => ({
      ...current,
      [portfolioId]: { ...(current[portfolioId] ?? { shortName: "", longName: "", assetClass: "" }), [field]: value },
    }));
  }

  return (
    <form action={formAction} className="change-form">
      <input name="clientId" type="hidden" value={clientId} />
      <input name="items" type="hidden" value={JSON.stringify(switchItems)} />
      <input name="newBenchmarkItems" type="hidden" value={JSON.stringify(newBenchmarkItems)} />
      <section className="form-section"><div className="section-number" aria-label="Stap 1">01</div><div className="section-content">
        <div className="section-heading"><h2>Context van de aanvraag</h2><p>De klantconfiguratie bepaalt welke portefeuilles en IST-benchmarks beschikbaar zijn.</p></div>
        <label className="field"><span>Klant</span><select name="clientId" value={clientId} onChange={(event) => chooseClient(event.target.value)}>{clients.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.externalReference}</option>)}</select></label>
        <div className="field-row"><label className="field"><span>Aanvrager</span><input name="requestedBy" required placeholder="Naam van de contactpersoon" defaultValue="Ruben Verboon" /></label><label className="field"><span>Gewenste ingangsdatum</span><input name="effectiveDate" required type="date" /></label></div>
        <label className="field"><span>Reden van de wijziging</span><textarea name="rationale" required minLength={10} placeholder="Bijvoorbeeld: benchmark aanpassen aan het geactualiseerde beleggingsbeleid." /></label>
      </div></section>
      <section className="form-section"><div className="section-number" aria-label="Stap 2">02</div><div className="section-content">
        <div className="section-heading"><h2>Portefeuilles en benchmarks</h2><p>Selecteer de portefeuilles waarvoor de benchmark verandert. IST komt uit de huidige afspraak; kies daarna SOLL.</p></div>
        <div className="portfolio-list">{client?.portfolios.map((portfolio) => {
          const selected = selectedIds.includes(portfolio.id);
          const target = targets[portfolio.id];
          const isNew = target === NEW_BENCHMARK_VALUE;
          const details = newBenchmarkDetails[portfolio.id] ?? { shortName: "", longName: "", assetClass: "" };
          return <article className={`portfolio-card ${selected ? "is-selected" : ""}`} key={portfolio.id}>
            <label className="portfolio-toggle"><input type="checkbox" checked={selected} onChange={() => togglePortfolio(portfolio.id)} aria-label={`Selecteer ${portfolio.name}`} /><span><b>{portfolio.name}</b><small>{portfolio.externalReference}</small></span></label>
            <div className="benchmark-row"><div className="benchmark ist"><span>IST</span><b>{portfolio.currentBenchmark.code}</b><small>{portfolio.currentBenchmark.name}</small></div><span className="arrow">→</span><label className="benchmark soll"><span>SOLL</span>
              <select disabled={!selected} value={target ?? ""} onChange={(event) => setTarget(portfolio.id, event.target.value)} aria-label={`Kies SOLL benchmark voor ${portfolio.name}`}>
                <option value="">Kies benchmark</option>
                <option disabled>───</option>
                {benchmarks.filter((benchmark) => benchmark.id !== portfolio.currentBenchmarkId).map((benchmark) => <option key={benchmark.id} value={benchmark.id}>{benchmark.code} — {benchmark.name}</option>)}
                <option disabled>───</option>
                <option value={NEW_BENCHMARK_VALUE}>➕ Nieuwe benchmark aanvragen…</option>
              </select></label>
            </div>
            {isNew && (
              <div className="new-benchmark-fields">
                <p className="new-benchmark-hint">Vul de gegevens in voor de nieuwe benchmark (+4 weken, +€ 5.000)</p>
                <div className="new-benchmark-grid">
                  <input name={`nb_${portfolio.id}_shortName`} placeholder="Short name (code)" value={details.shortName} onChange={(e) => setNewDetail(portfolio.id, "shortName", e.target.value)} />
                  <input name={`nb_${portfolio.id}_longName`} placeholder="Long name" value={details.longName} onChange={(e) => setNewDetail(portfolio.id, "longName", e.target.value)} />
                  <select name={`nb_${portfolio.id}_assetClass`} value={details.assetClass} onChange={(e) => setNewDetail(portfolio.id, "assetClass", e.target.value)}>
                    <option value="">Asset class</option>
                    {ASSET_CLASS_OPTIONS.map((ac) => <option key={ac} value={ac}>{ac}</option>)}
                  </select>
                </div>
              </div>
            )}
          </article>;
        })}</div>
      </div></section>
      <section className="form-section"><div className="section-number" aria-label="Stap 3">03</div><div className="section-content">
        <div className="section-heading"><h2>Kosten en doorlooptijd</h2><p>Overzicht van de geschatte kosten en doorlooptijd op basis van uw selectie.</p></div>
        <div className="cost-summary-inline">
          {switchItems.length > 0 && (
            <div className="cost-summary-row">
              <span><b>{switchItems.length}</b> bestaande benchmark(s)</span>
              <span>1 week doorlooptijd</span>
              <span>Kosten: benchmark afhankelijk</span>
            </div>
          )}
          {newBenchmarkItems.length > 0 && (
            <div className="cost-summary-row highlight">
              <span><b>{newBenchmarkItems.length}</b> nieuwe benchmark(s)</span>
              <span>+4 weken extra</span>
              <span>+€ 5.000 per stuk</span>
            </div>
          )}
        </div>
      </div></section>
      <section className="form-section"><div className="section-number" aria-label="Stap 4">04</div><div className="section-content">
        <div className="section-heading"><h2>Controle en verzending</h2><p>Het request wordt als "submitted" vastgelegd en is klaar voor distributie naar de betrokken stakeholders.</p></div>
        <div className="stakeholder-grid"><div><b>Eigen administratie</b><span>Catalogus, facturatie en klantrapportage</span></div><div><b>Asset service provider</b><span>Portefeuilleadministratie</span></div><div><b>FactSet</b><span>Performance versus benchmark</span></div></div>
        {state.issues && <div className="form-errors" role="alert" aria-live="polite"><b>Controleer de aanvraag</b><ul>{state.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
        <div className="submit-row"><p><b>{totalSwitchPortfolios}</b> portefeuille(s) geselecteerd</p><button className="button button-primary" disabled={pending || totalSwitchPortfolios === 0} type="submit">{pending ? "Aanvraag opslaan…" : "Genereer change request →"}</button></div>
      </div></section>
    </form>
  );
}
