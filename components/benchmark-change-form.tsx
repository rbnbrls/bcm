"use client";

import { useActionState, useMemo, useState } from "react";
import { createBenchmarkChange, type FormState } from "@/app/changes/new/actions";
import type { Benchmark, ClientConfig } from "@/lib/types";

type Props = { clients: ClientConfig[]; benchmarks: Benchmark[] };
const initialState: FormState = {};

export function BenchmarkChangeForm({ clients, benchmarks }: Props) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [state, formAction, pending] = useActionState(createBenchmarkChange, initialState);
  const client = useMemo(() => clients.find((candidate) => candidate.id === clientId), [clientId, clients]);
  const selectedPortfolios = client?.portfolios.filter((portfolio) => selectedIds.includes(portfolio.id)) ?? [];
  const selectedItems = selectedPortfolios.map((portfolio) => ({ portfolioId: portfolio.id, previousBenchmarkId: portfolio.currentBenchmarkId, requestedBenchmarkId: targets[portfolio.id] ?? "" }));

  function chooseClient(nextId: string) { setClientId(nextId); setSelectedIds([]); setTargets({}); }
  function togglePortfolio(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((portfolioId) => portfolioId !== id) : [...current, id]);
  }
  function setTarget(portfolioId: string, benchmarkId: string) { setTargets((current) => ({ ...current, [portfolioId]: benchmarkId })); }

  return (
    <form action={formAction} className="change-form">
      <input name="clientId" type="hidden" value={clientId} />
      <input name="items" type="hidden" value={JSON.stringify(selectedItems)} />
      <section className="form-section"><div className="section-number">01</div><div className="section-content">
        <div className="section-heading"><h2>Context van de aanvraag</h2><p>De klantconfiguratie bepaalt welke portefeuilles en IST-benchmarks beschikbaar zijn.</p></div>
        <label className="field"><span>Klant</span><select value={clientId} onChange={(event) => chooseClient(event.target.value)}>{clients.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.externalReference}</option>)}</select></label>
        <div className="field-row"><label className="field"><span>Aanvrager</span><input name="requestedBy" required placeholder="Naam van de contactpersoon" defaultValue="Ruben Verboon" /></label><label className="field"><span>Gewenste ingangsdatum</span><input name="effectiveDate" required type="date" /></label></div>
        <label className="field"><span>Reden van de wijziging</span><textarea name="rationale" required minLength={10} placeholder="Bijvoorbeeld: benchmark aanpassen aan het geactualiseerde beleggingsbeleid." /></label>
      </div></section>
      <section className="form-section"><div className="section-number">02</div><div className="section-content">
        <div className="section-heading"><h2>Portefeuilles en benchmarks</h2><p>Selecteer de portefeuilles waarvoor de benchmark verandert. IST komt uit de huidige afspraak; kies daarna SOLL.</p></div>
        <div className="portfolio-list">{client?.portfolios.map((portfolio) => {
          const selected = selectedIds.includes(portfolio.id); const target = targets[portfolio.id];
          return <article className={`portfolio-card ${selected ? "is-selected" : ""}`} key={portfolio.id}>
            <label className="portfolio-toggle"><input type="checkbox" checked={selected} onChange={() => togglePortfolio(portfolio.id)} /><span><b>{portfolio.name}</b><small>{portfolio.externalReference}</small></span></label>
            <div className="benchmark-row"><div className="benchmark ist"><span>IST</span><b>{portfolio.currentBenchmark.code}</b><small>{portfolio.currentBenchmark.name}</small></div><span className="arrow">→</span><label className="benchmark soll"><span>SOLL</span><select disabled={!selected} value={target ?? ""} onChange={(event) => setTarget(portfolio.id, event.target.value)}><option value="">Kies benchmark</option>{benchmarks.filter((benchmark) => benchmark.id !== portfolio.currentBenchmarkId).map((benchmark) => <option key={benchmark.id} value={benchmark.id}>{benchmark.code} — {benchmark.name}</option>)}</select></label></div>
          </article>;
        })}</div>
      </div></section>
      <section className="form-section"><div className="section-number">03</div><div className="section-content">
        <div className="section-heading"><h2>Controle en verzending</h2><p>Het request wordt als “submitted” vastgelegd en is klaar voor distributie naar de betrokken stakeholders.</p></div>
        <div className="stakeholder-grid"><div><b>Eigen administratie</b><span>Catalogus, facturatie en klantrapportage</span></div><div><b>Asset service provider</b><span>Portefeuilleadministratie</span></div><div><b>FactSet</b><span>Performance versus benchmark</span></div></div>
        {state.issues && <div className="form-errors" role="alert"><b>Controleer de aanvraag</b><ul>{state.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
        <div className="submit-row"><p><b>{selectedPortfolios.length}</b> portefeuille(s) geselecteerd</p><button className="button button-primary" disabled={pending || selectedPortfolios.length === 0} type="submit">{pending ? "Aanvraag opslaan…" : "Genereer change request →"}</button></div>
      </div></section>
    </form>
  );
}
