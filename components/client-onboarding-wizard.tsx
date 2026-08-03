"use client";

import { useState } from "react";
import {
  ClientInfoStepForm,
  isClientInfoStepValid,
  type ClientInfoStepValue,
} from "@/components/client-info-step-form";
import {
  PortfolioConfigStep,
  isPortfolioConfigStepValid,
  type PortfolioConfigStepValue,
} from "@/components/portfolio-config-step";
import type { ClientConfigAssetClass } from "@/lib/types";

/**
 * Client onboarding wizard shell (task t_60c3573f).
 *
 * Multi-step container that composes the two independent step forms and owns
 * all wizard-level state:
 *
 *   1. Klantgegevens      — ClientInfoStepForm (client code + client name)
 *   2. Portfolio & eerste configuratieregel — PortfolioConfigStep
 *      (portfolio name/code, asset class, allocation percentage)
 *
 * All data collected from both steps is staged in local state (clientCode,
 * clientName, portfolioName, portfolioCode, assetClass, allocationPercentage)
 * and preserved while navigating back and forth — nothing is cleared on step
 * switches.
 *
 * Navigation rules:
 *  - "Volgende →" is only enabled when the current step passes validation
 *    (the step forms report errors + validity via onValidationChange).
 *  - "← Vorige" never validates and preserves all staged values.
 *  - On the final step, "Genereer change request →" passes the complete
 *    staged payload to the optional `onSubmit` callback. Without a callback
 *    (no backend wired yet — see task t_7b540257) the payload is logged to
 *    the console instead. The staged data is NOT cleared before/after submit.
 *
 * The step forms intentionally contain no navigation and no wizard-level
 * state; step switching and staged data live here.
 */

export type ClientOnboardingData = {
  clientCode: string;
  clientName: string;
  portfolioName: string;
  portfolioCode: string;
  assetClass: string;
  allocationPercentage: string;
};

type Props = {
  assetClasses: ClientConfigAssetClass[];
  /**
   * Submission callback receiving the complete staged payload on the final
   * step. When omitted, the payload is logged to the console instead
   * (no backend wired yet — task t_7b540257 replaces this with the real
   * staging + redirect).
   */
  onSubmit?: (data: ClientOnboardingData) => void;
};

const EMPTY_CLIENT_INFO: ClientInfoStepValue = { clientCode: "", clientName: "" };
const EMPTY_PORTFOLIO: PortfolioConfigStepValue = {
  portfolioName: "",
  portfolioCode: "",
  assetClass: "",
  allocationPercentage: "",
};

export function ClientOnboardingWizard({ assetClasses, onSubmit }: Props) {
  const [step, setStep] = useState<1 | 2>(1);

  // ── Staged data (owned by the shell, survives back/forth navigation) ──
  const [clientInfo, setClientInfo] = useState<ClientInfoStepValue>(EMPTY_CLIENT_INFO);
  const [portfolio, setPortfolio] = useState<PortfolioConfigStepValue>(EMPTY_PORTFOLIO);

  // ── Per-step "user tried to interact" flags → inline errors appear ──
  const [showStep1Errors, setShowStep1Errors] = useState(false);
  const [showStep2Errors, setShowStep2Errors] = useState(false);

  const step1Valid = isClientInfoStepValid(clientInfo);
  const step2Valid = isPortfolioConfigStepValid(portfolio);

  function handleBack() {
    setStep((s) => (s === 2 ? 1 : s));
  }

  function handleNext() {
    if (!step1Valid) {
      setShowStep1Errors(true);
      return;
    }
    setStep(2);
  }

  function buildPayload(): ClientOnboardingData {
    return {
      clientCode: clientInfo.clientCode.trim().toUpperCase(),
      clientName: clientInfo.clientName.trim(),
      portfolioName: portfolio.portfolioName.trim(),
      portfolioCode: portfolio.portfolioCode.trim().toUpperCase(),
      assetClass: portfolio.assetClass,
      allocationPercentage: portfolio.allocationPercentage.trim(),
    };
  }

  function handleSubmit() {
    if (!step2Valid) {
      setShowStep2Errors(true);
      return;
    }
    const payload = buildPayload();
    if (onSubmit) {
      onSubmit(payload);
    } else {
      // No backend wired yet (task t_7b540257) — surface the staged payload
      // so the complete data set is available at submission time.
      console.log("[ClientOnboardingWizard] staged payload:", payload);
    }
    // Intentionally do NOT clear staged data before/after submission.
  }

  return (
    <form className="change-form" onSubmit={(e) => e.preventDefault()}>
      {/* Step indicator */}
      <div className="step-indicator">
        {([1, 2] as const).map((s) => (
          <div key={s} className={`step-dot ${step === s ? "active" : step > s ? "done" : ""}`}>
            <span className="step-number">{s}</span>
            <span className="step-label">
              {s === 1 ? "Klantgegevens" : "Portfolio & configuratieregel"}
            </span>
          </div>
        ))}
      </div>

      {/* ════════════ Step 1: Klantgegevens ════════════ */}
      {step === 1 && (
        <div className="wizard-step">
          <ClientInfoStepForm
            value={clientInfo}
            onChange={(value) => {
              setClientInfo(value);
              setShowStep1Errors(true);
            }}
            showErrors={showStep1Errors}
          />
          <div className="form-nav">
            <span></span>
            <button type="button" className="button button-primary" onClick={handleNext} disabled={!step1Valid}>
              Volgende →
            </button>
          </div>
        </div>
      )}

      {/* ════════════ Step 2: Portfolio & eerste configuratieregel ════════════ */}
      {step === 2 && (
        <div className="wizard-step">
          <PortfolioConfigStep
            value={portfolio}
            onChange={(value) => {
              setPortfolio(value);
              setShowStep2Errors(true);
            }}
            assetClasses={assetClasses}
            showErrors={showStep2Errors}
          />
          <div className="form-nav">
            <button type="button" className="button" onClick={handleBack}>
              ← Vorige
            </button>
            <button type="button" className="button button-primary" onClick={handleSubmit} disabled={!step2Valid}>
              Genereer change request →
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
