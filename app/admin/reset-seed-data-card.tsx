"use client";

import { useActionState } from "react";
import { resetSeedDataAction, type ResetSeedDataState } from "./actions";

const initialState: ResetSeedDataState = {
  success: false,
  message: "",
};

export function ResetSeedDataCard() {
  const [state, action, pending] = useActionState(resetSeedDataAction, initialState);

  return (
    <section className="admin-card admin-card-danger">
      <h2>Reset seed data</h2>
      <p>
        Zet testdata en client_config terug naar de standaard seedwaarden.
        Operationele changes, staged wijzigingen, approvals en logs worden geleegd.
      </p>
      <form action={action} className="admin-reset-form">
        <label className="field">
          <span>Bevestiging</span>
          <input
            name="confirmation"
            placeholder="Typ RESET"
            autoComplete="off"
            disabled={pending}
          />
        </label>
        <button className="button button-danger" type="submit" disabled={pending}>
          {pending ? "Reset wordt uitgevoerd..." : "Reset seed data"}
        </button>
      </form>
      {state.message ? (
        <div
          className={state.success ? "approval-success" : "form-errors"}
          role="alert"
          style={{ marginTop: 12 }}
        >
          <b>{state.success ? "Klaar" : "Niet uitgevoerd"}</b>
          <p>{state.message}</p>
          {state.details ? <p>{state.details}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
