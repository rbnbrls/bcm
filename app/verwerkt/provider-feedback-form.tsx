"use client";

import { useActionState } from "react";
import { updateStatus } from "@/app/changes/actions";

type Props = {
  changeId: string;
  reference: string;
};

type FormState = { success: boolean; message: string };

async function processChange(_prev: FormState, formData: FormData): Promise<FormState> {
  return updateStatus(_prev, formData);
}

export function ProviderFeedbackForm({ changeId, reference }: Props) {
  const [state, action, pending] = useActionState(processChange, {
    success: false,
    message: "",
  });

  return (
    <form action={action}>
      <input type="hidden" name="id" value={changeId} />
      <input type="hidden" name="status" value="processed" />
      <button
        type="submit"
        disabled={pending}
        className="button button-primary"
        style={{ fontSize: 13 }}
      >
        {pending ? "Bezig…" : `${reference} — Markeer als verwerkt`}
      </button>
      {state.message && (
        <p
          role="alert"
          style={{
            marginTop: 8,
            fontSize: 12,
            color: state.success ? "var(--accent-deep)" : "#c0392b",
          }}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
