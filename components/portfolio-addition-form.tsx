"use client";

import { useActionState, useMemo, useState } from "react";
import { createPortfolioAdditionChange, type PortfolioFormState } from "@/app/changes/new/portfolio-actions";
import type {
  ClientConfigAssetClass,
  ClientConfigBenchmark,
  ClientConfigClient,
  ClientConfigManager,
  ClientConfigNpcClassification,
  ClientConfigPortfolio,
  ClientConfigSubAssetClass,
} from "@/lib/types";

type Props = {
  /** Change type slug the form was opened with (portfolio_addition for backward compat). */
  changeTypeSlug?: string;
  clients: ClientConfig[];
  benchmarks: ClientConfigBenchmark[];
  assetClasses: ClientConfigAssetClass[];
  subAssetClasses: ClientConfigSubAssetClass[];
  managers: ClientConfigManager[];
  npcClassifications: ClientConfigNpcClassification[];
};

const initialState: PortfolioFormState = {};

export function PortfolioAdditionForm({
  changeTypeSlug = "portfolio_addition",
  benchmarks,
  assetClasses,
  subAssetClasses,
  managers,
  npcClassifications,
}: Props) {
  const [step, setStep] = useState(1);
  const [state, formAction, pending] = useActionState(createPortfolioAdditionChange, initialState);

  // Step 1: Portfolio definiëren
  const [clientCode, setClientCode] = useState("");
  const [portfolioCode, setPortfolioCode] = useState("");
  const [longName, setLongName] = useState("");
  const [shortName, setShortName] = useState("");
  const [benchmarkCode, setBenchmarkCode] = useState("");

  // Step 2: Classificatie instellen
  const [assetClassName, setAssetClassName] = useState("");
  const [subAssetClassName, setSubAssetClassName] = useState("");
  const [managerCode, setManagerCode] = useState("");

  // Step 3: NPC classificatie
  const [npcClassificationId, setNpcClassificationId] = useState("");

  // Step 4: Metadata
  const [requestedBy, setRequestedBy] = useState("");
  const [rationale, setRationale] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");

  // Derived
  const selectedAssetClass = useMemo(
    () => assetClasses.find((a) => a.assetClassName === assetClassName),
    [assetClassName, assetClasses]
  );
  const validSubAssetClasses = useMemo(() => {
    if (!selectedAssetClass) return [];
    return subAssetClasses.filter((s) => s.assetClassId === selectedAssetClass.assetClassId);
  }, [selectedAssetClass, subAssetClasses]);
  const selectedBenchmark = useMemo(
    () => benchmarks.find((b) => b.benchmarkCode === benchmarkCode),
    [benchmarkCode, benchmarks]
  );
  const selectedManager = useMemo(
    () => managers.find((m) => m.managerCode === managerCode),
    [managerCode, managers]
  );
  const selectedNpcClassification = useMemo(
    () => npcClassifications.find((n) => n.npcClassificationId === Number(npcClassificationId)),
    [npcClassificationId, npcClassifications]
  );

  // Explicit client selection (portfolio_configuration_create)
  const selectedClient = useMemo(
    () => clients.find((c) => c.clientCode === clientCode),
    [clientCode, clients]
  );
  const clientPortfolioSuggestions = useMemo(() => {
    if (!requireClient || !clientCode) return [];
    // The server validates that a portfolio belongs to the selected client when
    // its code equals the client code or starts with it — mirror that here.
    // Also only suggest codes that can actually pass the portfolio-code schema
    // ([A-Z0-9]{2,15}) so the dropdown never offers a dead-end option.
    return portfolios.filter(
      (p) =>
        p.activeInd === true &&
        /^[A-Z0-9]{2,15}$/.test(p.portfolioCode) &&
        (p.portfolioCode === clientCode || p.portfolioCode.startsWith(clientCode))
    );
  }, [requireClient, clientCode, portfolios]);

  function handleBack() { setStep((s) => Math.max(1, s - 1)); }
  function handleNext() { setStep((s) => Math.min(4, s + 1)); }
  function handleClientChange(nextRaw: string) {
    const next = nextRaw.toUpperCase();
    setClientCode(next);
    // Keep the portfolio code consistent with the selected client: prefill with
    // the client code when empty, and reset it when it no longer belongs to the
    // newly selected client (the server rejects such combinations).
    setPortfolioCode((prev) => {
      if (!next) return prev;
      const upper = prev.toUpperCase();
      if (!upper) return next;
      return upper === next || upper.startsWith(next) ? prev : next;
    });
  }
  function isStep1Valid() {
    if (requireClient && !clientCode) return false;
    return portfolioCode.length >= 2 && longName.length >= 1 && shortName.length >= 1 && benchmarkCode;
  }
  function isStep2Valid() {
    return assetClassName && subAssetClassName && managerCode;
  }
  function isStep3Valid() {
    return npcClassificationId !== "";
  }
  function isStep4Valid() {
    return requestedBy.length >= 2 && rationale.length >= 10 && effectiveDate;
  }

  return (
    <form action={formAction} className="change-form">
      {/* Hidden fields for all collected data */}
      <input type="hidden" name="changeTypeSlug" value={changeTypeSlug} />
      <input type="hidden" name="portfolioCode" value={portfolioCode} />
      <input type="hidden" name="longName" value={longName} />
      <input type="hidden" name="shortName" value={shortName} />
      <input type="hidden" name="benchmarkCode" value={benchmarkCode} />
      <input type="hidden" name="assetClass" value={assetClassName} />
      <input type="hidden" name="subAssetClass" value={subAssetClassName} />
      <input type="hidden" name="managerCode" value={managerCode} />
      <input type="hidden" name="npcClassificationId" value={npcClassificationId} />
      <input type="hidden" name="requestedBy" value={requestedBy} />
      <input type="hidden" name="rationale" value={rationale} />
      <input type="hidden" name="effectiveDate" value={effectiveDate} />

      {/* Step indicator */}
      <div className="step-indicator">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`step-dot ${step === s ? "active" : step > s ? "done" : ""}`}>
            <span className="step-number">{s}</span>
            <span className="step-label">
              {s === 1 ? "Portfolio definiëren" : s === 2 ? "Dimensies" : s === 3 ? "NPC classificatie" : "Controleren"}
            </span>
          </div>
        ))}
      </div>

      {state.issues && state.issues.length > 0 && (
        <div className="error-banner" role="alert">
          <ul>
            {state.issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Step 1: Portfolio definiëren */}
      {step === 1 && (
        <section className="form-section">
          <div className="section-number" aria-label="Stap 1">01</div>
          <div className="section-content">
            <div className="section-heading">
              <h2>Portfolio definiëren</h2>
              <p>
                {requireClient
                  ? "Kies een bestaande klant en stel de nieuwe portefeuille in volgens het genormaliseerde model."
                  : "Stel de basisgegevens van de nieuwe portefeuille in volgens het genormaliseerde model."}
              </p>
            </div>

            {requireClient && (
              <label className="field">
                <span>Klant<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <select value={clientCode} onChange={(e) => handleClientChange(e.target.value)} required>
                  <option value="">Kies klant</option>
                  {clients.map((c) => (
                    <option key={c.clientCode} value={c.clientCode}>
                      {c.clientCode} — {c.clientName}
                    </option>
                  ))}
                </select>
                <small style={{ color: "var(--muted)" }}>De klant waaronder deze portefeuille valt (uit client_config.client)</small>
              </label>
            )}

            <label className="field">
              <span>Portfolio code<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <input
                type="text"
                list={requireClient && clientCode ? "portfolio-suggestions" : undefined}
                value={portfolioCode}
                onChange={(e) => setPortfolioCode(e.target.value.toUpperCase())}
                placeholder="Bijv. ADP"
                required
                minLength={2}
                maxLength={15}
              />
              {requireClient && clientCode && (
                <datalist id="portfolio-suggestions">
                  {clientPortfolioSuggestions.map((p) => (
                    <option key={p.portfolioId} value={p.portfolioCode} />
                  ))}
                </datalist>
              )}
              <small style={{ color: "var(--muted)" }}>
                {requireClient && clientCode
                  ? clientPortfolioSuggestions.length > 0
                    ? `Bestaande portefeuilles voor ${clientCode}: ${clientPortfolioSuggestions.map((p) => p.portfolioCode).join(", ")}`
                    : `Geen bestaande portefeuille gevonden voor ${clientCode} — voer een nieuwe code in`
                  : "2-15 hoofdletters of cijfers"}
              </small>
            </label>

            <div className="field-row">
              <label className="field">
                <span>Lange naam<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <input
                  type="text"
                  value={longName}
                  onChange={(e) => setLongName(e.target.value)}
                  placeholder="Bijv. Rendementsportefeuille aandelen"
                  required
                  maxLength={255}
                />
              </label>
              <label className="field">
                <span>Korte naam<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <input
                  type="text"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  placeholder="Bijv. RPA"
                  required
                  maxLength={100}
                />
              </label>
            </div>

            <label className="field">
              <span>Benchmark<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <select value={benchmarkCode} onChange={(e) => setBenchmarkCode(e.target.value)} required>
                <option value="">Kies benchmark</option>
                {benchmarks.map((b) => (
                  <option key={b.benchmarkCode} value={b.benchmarkCode}>
                    {b.benchmarkCode} — {b.benchmarkName ?? "(geen naam)"}
                  </option>
                ))}
              </select>
              <small style={{ color: "var(--muted)" }}>De initiële benchmark voor deze account</small>
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

      {/* Step 2: Dimensies */}
      {step === 2 && (
        <section className="form-section">
          <div className="section-number" aria-label="Stap 2">02</div>
          <div className="section-content">
            <div className="section-heading">
              <h2>Dimensies instellen</h2>
              <p>Kies asset class, sub asset class en manager.</p>
            </div>

            <div className="field-row">
              <label className="field">
                <span>Asset class<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <select value={assetClassName} onChange={(e) => {
                  setAssetClassName(e.target.value);
                  setSubAssetClassName("");
                }} required>
                  <option value="">Kies asset class</option>
                  {assetClasses.map((a) => (
                    <option key={a.assetClassId} value={a.assetClassName}>{a.assetClassName}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Sub asset class<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <select value={subAssetClassName} onChange={(e) => setSubAssetClassName(e.target.value)} required disabled={!assetClassName}>
                  <option value="">Kies sub asset class</option>
                  {validSubAssetClasses.map((s) => (
                    <option key={s.subAssetClassId} value={s.subAssetClassName}>{s.subAssetClassName}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span>Manager<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <select value={managerCode} onChange={(e) => setManagerCode(e.target.value)} required>
                <option value="">Kies manager</option>
                {managers.map((m) => (
                  <option key={m.managerId} value={m.managerCode}>{m.managerName} · {m.managerCode}</option>
                ))}
              </select>
            </label>

            <div className="form-nav">
              <button type="button" className="button button-secondary" onClick={handleBack}>← Terug</button>
              <button type="button" className="button button-primary" onClick={handleNext} disabled={!isStep2Valid()}>
                Volgende →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Step 3: NPC classificatie */}
      {step === 3 && (
        <section className="form-section">
          <div className="section-number" aria-label="Stap 3">03</div>
          <div className="section-content">
            <div className="section-heading">
              <h2>NPC classificatie</h2>
              <p>Kies de classificatie voor niet-pensioen contracten.</p>
            </div>

            <label className="field">
              <span>NPC classificatie<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <select value={npcClassificationId} onChange={(e) => setNpcClassificationId(e.target.value)} required>
                <option value="">Kies NPC classificatie</option>
                {npcClassifications.map((n) => (
                  <option key={n.npcClassificationId} value={n.npcClassificationId}>{n.classificationName}</option>
                ))}
              </select>
            </label>

            <div className="form-nav">
              <button type="button" className="button button-secondary" onClick={handleBack}>← Terug</button>
              <button type="button" className="button button-primary" onClick={handleNext} disabled={!isStep3Valid()}>
                Volgende →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Step 4: Controleren */}
      {step === 4 && (
        <section className="form-section">
          <div className="section-number" aria-label="Stap 4">04</div>
          <div className="section-content">
            <div className="section-heading">
              <h2>Controleren en verzenden</h2>
              <p>Controleer de gegevens en licht de wijziging toe.</p>
            </div>

            <div className="summary-box">
              {requireClient && (
                <p><b>Klant:</b> {selectedClient ? `${selectedClient.clientCode} — ${selectedClient.clientName}` : clientCode || "(niet gekozen)"}</p>
              )}
              <p><b>Portfolio:</b> {portfolioCode} — {longName} ({shortName})</p>
              <p><b>Benchmark:</b> {selectedBenchmark?.benchmarkCode} — {selectedBenchmark?.benchmarkName ?? "(geen naam)"}</p>
              <p><b>Asset class:</b> {assetClassName} / {subAssetClassName}</p>
              <p><b>Manager:</b> {selectedManager?.managerName} ({selectedManager?.managerCode})</p>
              <p><b>NPC classificatie:</b> {selectedNpcClassification?.classificationName}</p>
            </div>

            <label className="field">
              <span>Aangevraagd door<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <input type="text" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} required minLength={2} />
            </label>

            <label className="field">
              <span>Reden<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} required minLength={10} rows={3} />
            </label>

            <label className="field">
              <span>Ingangsdatum<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required />
            </label>

            <div className="form-nav">
              <button type="button" className="button button-secondary" onClick={handleBack}>← Terug</button>
              <button type="submit" className="button button-primary" disabled={pending || !isStep4Valid()}>
                {pending ? "Bezig..." : "Change aanmaken"}
              </button>
            </div>
          </div>
        </section>
      )}
    </form>
  );
}
