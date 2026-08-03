"use client";

import { startTransition, useActionState } from "react";
import {
  ClientOnboardingWizard,
  type ClientOnboardingData,
} from "@/components/client-onboarding-wizard";
import { createClientOnboardingChange, type ClientOnboardingFormState } from "./client-onboarding-actions";
import type { ClientConfigAssetClass } from "@/lib/types";

const initialState: ClientOnboardingFormState = {};

type Props = {
  assetClasses: ClientConfigAssetClass[];
};

/**
 * Submission wiring for the client onboarding wizard (task t_7b540257,
 * extended t_4fbdd465).
 *
 * Renders the wizard with an `onSubmit` handler that packages the staged
 * payload into a FormData and dispatches it to the
 * `createClientOnboardingChange` server action. The action validates, creates
 * the change request with complete IST/SOLL fields, stages the portfolio +
 * parent-account metadata via stagePortfolioMetadataChange, and redirects to
 * the change detail page; any server-side issues (including metadata staging
 * validation errors) are rendered below the wizard so the user can correct
 * them.
 */
export function ClientOnboardingSubmit({ assetClasses }: Props) {
  const [state, formAction, pending] = useActionState(createClientOnboardingChange, initialState);

  function handleSubmit(data: ClientOnboardingData) {
    const formData = new FormData();
    formData.set("clientCode", data.clientCode);
    formData.set("clientName", data.clientName);
    formData.set("portfolioName", data.portfolioName);
    formData.set("portfolioCode", data.portfolioCode);
    formData.set("assetClassCode", data.assetClass);
    formData.set("allocationPercentage", data.allocationPercentage);
    formData.set("parentAccountCode", data.parentAccountCode);
    formData.set("msaParentAccountCode", data.msaParentAccountCode);
    startTransition(() => formAction(formData));
  }

  return (
    <>
      <ClientOnboardingWizard assetClasses={assetClasses} onSubmit={handleSubmit} />
      {state.issues && state.issues.length > 0 && (
        <div className="form-errors" role="alert" aria-live="polite">
          {state.issues.map((issue, index) => (
            <p key={index}>{issue}</p>
          ))}
        </div>
      )}
      {state.message && <p className="form-success" role="status">{state.message}</p>}
      {pending && <p className="form-pending" role="status">Change request wordt aangemaakt…</p>}
    </>
  );
}
