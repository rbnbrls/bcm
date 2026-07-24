"use client";

import { useActionState, useState } from "react";
import { submitFeedback, type FeedbackState } from "@/app/feedback/actions";

const initialState: FeedbackState | null = null;

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(submitFeedback, initialState);

  function close() {
    setOpen(false);
  }

  return (
    <>
      {/* Subtle floating trigger button */}
      <button
        className="feedback-trigger"
        onClick={() => setOpen(true)}
        aria-label="Feedback geven"
        title="Feedback geven"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>Feedback</span>
      </button>

      {/* Backdrop */}
      {open && <div className="feedback-backdrop" onClick={close} />}

      {/* Modal */}
      <div className={`feedback-modal ${open ? "feedback-modal--open" : ""}`} role="dialog" aria-label="Feedback formulier">
        <div className="feedback-modal-header">
          <h3>Feedback</h3>
          <button className="feedback-close" onClick={close} aria-label="Sluiten">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {state?.ok ? (
          <div className="feedback-success">
            <p>Bedankt voor je feedback!</p>
            <p>
              Het issue is aangemaakt op{" "}
              <a href={state.url} target="_blank" rel="noopener noreferrer">
                GitHub &rarr;
              </a>
            </p>
            <button className="button button-secondary" onClick={close}>
              Sluiten
            </button>
          </div>
        ) : (
          <form className="feedback-form" action={formAction}>
            <label className="field">
              <span>Wat kan beter?</span>
              <input
                name="title"
                type="text"
                placeholder="Korte titel van je feedback"
                required
                minLength={3}
                disabled={pending}
              />
            </label>
            <label className="field">
              <span>Beschrijving</span>
              <textarea
                name="body"
                placeholder="Wat moet er anders werken op de website?"
                required
                minLength={3}
                rows={5}
                disabled={pending}
              />
            </label>

            {state && !state.ok && (
              <div className="form-errors" role="alert">
                <b>Er is een probleem:</b>
                <p>{state.message}</p>
              </div>
            )}

            <div className="feedback-submit-row">
              <button
                className="button button-primary"
                type="submit"
                disabled={pending}
              >
                {pending ? "Verzenden…" : "Verstuur feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
