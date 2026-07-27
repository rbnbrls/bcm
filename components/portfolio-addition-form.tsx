"use client";

import { useActionState, useMemo, useState } from "react";
import { createPortfolioAdditionChange, type PortfolioFormState } from "@/app/changes/new/portfolio-actions";
import type { ClientConfig, Benchmark, WtpClassification, AssetClassRow, Manager, BenchmarkGroup } from "@/lib/types";

/**
 * Portfolio-level AC keys and their valid Sub AC values.
 * Reused from lib/asset-classes.ts (inline for independence).
 */
const ASSET_CLASS_SUB_CLASSES: Record<string, string[]> = {
  CASH: ["LIQUIDITY", "SHORT_TERM", "MONEY_MARKET"],
  EQUITIES: ["AC WORLD", "AC EUROPE", "AC NORTH AMERICA", "AC PACIFIC", "AC EMERGING MARKETS", "SMALL CAPS"],
  FIXED_INCOME: ["SOVEREIGN EUROPE", "SOVEREIGN NORTH AMERICA", "CORPORATE IG", "CORPORATE HY", "EMERGING MARKETS DEBT", "INFLATION LINKED"],
  ALTERNATIVES: ["HEDGE FUNDS", "PRIVATE EQUITY", "INFRASTRUCTURE", "COMMODITIES"],
  REAL_ASSETS: ["REAL ESTATE", "TIMBER", "FARMLAND", "GOLD"],
  MULTI_ASSETS: ["BALANCED", "STRATEGIC", "TACTICAL"],
  OVERLAY: ["CURRENCY OVERLAY", "RATE OVERLAY", "VOLATILITY OVERLAY"],
  IMPACT: ["GREEN BONDS", "SOCIAL BONDS", "ESG EQUITY", "SUSTAINABILITY LINKED"],
};

type Props = {
  clients: ClientConfig[];
  benchmarks: Benchmark[];
  wtpClassifications: WtpClassification[];
  assetClassRows: AssetClassRow[];
  managers: Manager[];
  benchmarkGroups: BenchmarkGroup[];
  preselectedType?: string;
};

const initialState: PortfolioFormState = {};

export function PortfolioAdditionForm({
  clients,
  benchmarks,
  wtpClassifications,
  assetClassRows,
  managers,
  benchmarkGroups,
}: Props) {
  const [step, setStep] = useState(1);
  const [state, formAction, pending] = useActionState(createPortfolioAdditionChange, initialState);

  // Step 1: Portfolio definiëren
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [name, setName] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [currentBenchmarkId, setCurrentBenchmarkId] = useState("");
  const [currency, setCurrency] = useState("EUR");

  // Step 2: Classificatie instellen
  const [wtpClassificationId, setWtpClassificationId] = useState("");
  const [assetClassRowId, setAssetClassRowId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [benchmarkGroupId, setBenchmarkGroupId] = useState("");

  // Step 3: AC / Sub AC bepalen
  const [assetClass, setAssetClass] = useState("");
  const [subAssetClass, setSubAssetClass] = useState("");

  // Derived
  const client = useMemo(() => clients.find((c) => c.id === clientId), [clientId, clients]);
  const validSubClasses = assetClass ? (ASSET_CLASS_SUB_CLASSES[assetClass] ?? []) : [];
  const currentBenchmark = useMemo(() => benchmarks.find((b) => b.id === currentBenchmarkId), [currentBenchmarkId, benchmarks]);
  const wtpLabel = useMemo(() => wtpClassifications.find((w) => w.id === wtpClassificationId)?.name, [wtpClassificationId, wtpClassifications]);
  const acRowLabel = useMemo(() => assetClassRows.find((a) => a.id === assetClassRowId)?.name, [assetClassRowId, assetClassRows]);
  const managerLabel = useMemo(() => managers.find((m) => m.id === managerId)?.name, [managerId, managers]);
  const bgLabel = useMemo(() => benchmarkGroups.find((b) => b.id === benchmarkGroupId)?.name, [benchmarkGroupId, benchmarkGroups]);

  function handleBack() { setStep((s) => Math.max(1, s - 1)); }
  function handleNext() { setStep((s) => Math.min(4, s + 1)); }
  function isStep1Valid() { return clientId && name.length >= 2 && externalReference.length >= 2 && currentBenchmarkId; }
  function isStep2Valid() { return wtpClassificationId && assetClassRowId && managerId && benchmarkGroupId; }
  function isStep3Valid() { return assetClass && subAssetClass; }

  return (
    <form action={formAction} className="change-form">
      {/* Hidden fields for all collected data */}
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="externalReference" value={externalReference} />
      <input type="hidden" name="currentBenchmarkId" value={currentBenchmarkId} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="wtpClassificationId" value={wtpClassificationId} />
      <input type="hidden" name="assetClassRowId" value={assetClassRowId} />
      <input type="hidden" name="managerId" value={managerId} />
      <input type="hidden" name="benchmarkGroupId" value={benchmarkGroupId} />
      <input type="hidden" name="assetClass" value={assetClass} />
      <input type="hidden" name="subAssetClass" value={subAssetClass} />

      {/* Step indicator */}
      <div className="step-indicator">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`step-dot ${step === s ? "active" : step > s ? "done" : ""}`}>
            <span className="step-number">{s}</span>
            <span className="step-label">
              {s === 1 ? "Portfolio definiëren" : s === 2 ? "Classificatie" : s === 3 ? "AC / Sub AC" : "Controleren"}
            </span>
          </div>
        ))}
      </div>

      {/* ════════════ Step 1: Portfolio definiëren ════════════ */}
      {step === 1 && (
        <section className="form-section">
          <div className="section-number" aria-label="Stap 1">01</div>
          <div className="section-content">
            <div className="section-heading">
              <h2>Portfolio definiëren</h2>
              <p>Stel de basisgegevens van de nieuwe portefeuille in.</p>
            </div>

            <label className="field">
              <span>Cliënt<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="">Kies cliënt</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} · {c.externalReference}</option>
                ))}
              </select>
            </label>

            <div className="field-row">
              <label className="field">
                <span>Portefeuillenaam<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Bijv. Rendementsportefeuille" required minLength={2} maxLength={100} />
                <small style={{ color: "var(--muted)" }}>Naam van de portefeuille</small>
              </label>
              <label className="field">
                <span>Externe referentie<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <input type="text" value={externalReference} onChange={(e) => setExternalReference(e.target.value)}
                  placeholder="Bijv. HOR-RP" required minLength={2} maxLength={50} />
                <small style={{ color: "var(--muted)" }}>Moet uniek zijn per cliënt</small>
              </label>
            </div>

            <label className="field">
              <span>Huidige benchmark<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <select value={currentBenchmarkId} onChange={(e) => setCurrentBenchmarkId(e.target.value)} required>
                <option value="">Kies benchmark</option>
                {benchmarks.map((b) => (
                  <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                ))}
              </select>
              <small style={{ color: "var(--muted)" }}>De initiële benchmark voor deze portefeuille</small>
            </label>

            <label className="field">
              <span>Valuta</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
              <small style={{ color: "var(--muted)" }}>Standaard EUR</small>
            </label>

            <div className="form-nav">
              <span></span>
              <button type="button" className="button button-primary" onClick={handleNext} disabled={!isStep1Valid()}>
                Volgende →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ════════════ Step 2: Classificatie instellen ════════════ */}
      {step === 2 && (
        <section className="form-section">
          <div className="section-number" aria-label="Stap 2">02</div>
          <div className="section-content">
            <div className="section-heading">
              <h2>Classificatie instellen</h2>
              <p>Kies de WTP classificatie, asset class, manager en benchmark groep.</p>
            </div>

            <div className="field-row">
              <label className="field">
                <span>WTP classificatie<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <select value={wtpClassificationId} onChange={(e) => setWtpClassificationId(e.target.value)} required>
                  <option value="">Kies WTP</option>
                  {wtpClassifications.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Asset class (Klant AC)<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <select value={assetClassRowId} onChange={(e) => setAssetClassRowId(e.target.value)} required>
                  <option value="">Kies asset class</option>
                  {assetClassRows.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="field-row">
              <label className="field">
                <span>Manager<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <select value={managerId} onChange={(e) => setManagerId(e.target.value)} required>
                  <option value="">Kies manager</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Benchmark groep<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <select value={benchmarkGroupId} onChange={(e) => setBenchmarkGroupId(e.target.value)} required>
                  <option value="">Kies benchmark groep</option>
                  {benchmarkGroups.map((bg) => (
                    <option key={bg.id} value={bg.id}>{bg.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-nav">
              <button type="button" className="button" onClick={handleBack}>← Vorige</button>
              <button type="button" className="button button-primary" onClick={handleNext} disabled={!isStep2Valid()}>
                Volgende →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ════════════ Step 3: AC / Sub AC bepalen ════════════ */}
      {step === 3 && (
        <section className="form-section">
          <div className="section-number" aria-label="Stap 3">03</div>
          <div className="section-content">
            <div className="section-heading">
              <h2>AC en Sub AC bepalen</h2>
              <p>Kies de portefeuille-specifieke Asset Class en Sub Asset Class.</p>
            </div>

            <div className="field-row">
              <label className="field">
                <span>AC (portefeuille)<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <select
                  value={assetClass}
                  onChange={(e) => { setAssetClass(e.target.value); setSubAssetClass(""); }}
                  required
                >
                  <option value="">Kies AC</option>
                  {Object.keys(ASSET_CLASS_SUB_CLASSES).map((ac) => (
                    <option key={ac} value={ac}>{ac}</option>
                  ))}
                </select>
                <small style={{ color: "var(--muted)" }}>Portfolio-level asset class key</small>
              </label>
              <label className="field">
                <span>Sub AC<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <select
                  value={subAssetClass}
                  onChange={(e) => setSubAssetClass(e.target.value)}
                  required
                  disabled={!assetClass}
                >
                  <option value="">
                    {assetClass ? "Kies Sub AC" : "Eerst AC kiezen"}
                  </option>
                  {validSubClasses.map((sac) => (
                    <option key={sac} value={sac}>{sac}</option>
                  ))}
                </select>
                <small style={{ color: "var(--muted)" }}>
                  {assetClass
                    ? `Geldige Sub AC waardes voor ${assetClass}`
                    : "Selecteer eerst een AC om Sub AC te bepalen"}
                </small>
              </label>
            </div>

            <div className="form-nav">
              <button type="button" className="button" onClick={handleBack}>← Vorige</button>
              <button type="button" className="button button-primary" onClick={handleNext} disabled={!isStep3Valid()}>
                Volgende →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ════════════ Step 4: Controleren & activeren ════════════ */}
      {step === 4 && (
        <section className="form-section">
          <div className="section-number" aria-label="Stap 4">04</div>
          <div className="section-content">
            <div className="section-heading">
              <h2>Controleren en activeren</h2>
              <p>Controleer alle gegevens voordat de change wordt ingediend.</p>
            </div>

            <div className="review-section">
              <h3>Portfolio gegevens</h3>
              <table className="review-table">
                <tbody>
                  <tr><td>Cliënt</td><td><strong>{client?.name ?? "—"} · {client?.externalReference ?? "—"}</strong></td></tr>
                  <tr><td>Portefeuillenaam</td><td><strong>{name}</strong></td></tr>
                  <tr><td>Externe referentie</td><td><strong>{externalReference}</strong></td></tr>
                  <tr><td>Huidige benchmark</td><td><strong>{currentBenchmark?.code ?? "—"} — {currentBenchmark?.name ?? "—"}</strong></td></tr>
                  <tr><td>Valuta</td><td><strong>{currency}</strong></td></tr>
                </tbody>
              </table>
            </div>

            <div className="review-section">
              <h3>Classificatie</h3>
              <table className="review-table">
                <tbody>
                  <tr><td>WTP classificatie</td><td><strong>{wtpLabel ?? "—"}</strong></td></tr>
                  <tr><td>Asset class (Klant AC)</td><td><strong>{acRowLabel ?? "—"}</strong></td></tr>
                  <tr><td>Manager</td><td><strong>{managerLabel ?? "—"}</strong></td></tr>
                  <tr><td>Benchmark groep</td><td><strong>{bgLabel ?? "—"}</strong></td></tr>
                </tbody>
              </table>
            </div>

            <div className="review-section">
              <h3>AC / Sub AC</h3>
              <table className="review-table">
                <tbody>
                  <tr><td>AC (portefeuille)</td><td><strong>{assetClass}</strong></td></tr>
                  <tr><td>Sub AC</td><td><strong>{subAssetClass}</strong></td></tr>
                </tbody>
              </table>
            </div>

            <div className="review-section">
              <h3>Kosten en doorlooptijd</h3>
              <div className="cost-summary-inline" style={{ margin: 0 }}>
                <div className="cost-summary-row">
                  <span>Geschatte kosten</span>
                  <span>€ 500 EUR</span>
                </div>
                <div className="cost-summary-row">
                  <span>Doorlooptijd</span>
                  <span>5 dagen</span>
                </div>
                <div className="cost-summary-row highlight">
                  <span>Kostendetail</span>
                  <span>€500 vaste kost voor toevoegen van een portefeuille</span>
                </div>
              </div>
            </div>

            <div className="review-section">
              <h3>Aanvraag details</h3>
              <div className="field-row">
                <label className="field">
                  <span>Aanvrager<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                  <input name="requestedBy" required placeholder="Naam van de contactpersoon" defaultValue="Ruben Verboon" />
                </label>
                <label className="field">
                  <span>Gewenste ingangsdatum<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                  <input name="effectiveDate" required type="date" />
                </label>
              </div>
              <label className="field">
                <span>Reden van de wijziging<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <textarea name="rationale" required minLength={10} placeholder="Bijv. Toevoegen van een nieuwe portefeuille voor deze cliënt." />
              </label>
            </div>

            {state.issues && (
              <div className="form-errors" role="alert" aria-live="polite">
                <b>Controleer de aanvraag</b>
                <ul>{state.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
              </div>
            )}

            <div className="stakeholder-grid" style={{ marginTop: 16 }}>
              <div><b>Portefeuillebeheerder</b><span>Wordt geïnformeerd bij submit en approval</span></div>
              <div><b>Risk manager</b><span>Wordt geïnformeerd bij submit</span></div>
            </div>

            <div className="form-nav">
              <button type="button" className="button" onClick={handleBack}>← Vorige</button>
              <button className="button button-primary" disabled={pending} type="submit">
                {pending ? "Aanvraag opslaan…" : "Genereer change request →"}
              </button>
            </div>
          </div>
        </section>
      )}
    </form>
  );
}
