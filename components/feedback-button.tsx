"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitFeedback, type FeedbackState } from "@/app/feedback/actions";


/* Modal opens only from explicit user-initiated intent.
 * The sole open path is clicking `.feedback-trigger`.
 * There is no automatic opener: no `useEffect`, no route listener,
 * no keyboard opener, and no external mutation control.
 */
export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, pending] = useActionState(submitFeedback, null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Focus management: move focus into modal on open, return on close
  useEffect(() => {
    if (isOpen) {
      // Focus the close button (first focusable element in the modal)
      closeButtonRef.current?.focus();
    } else if (triggerRef.current) {
      // Return focus to the trigger button when modal closes
      triggerRef.current.focus();
    }
  }, [isOpen]);

  // Close on Escape key
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      close();
    }
  }

  function open() {
    setIsOpen(true);
  }

  function close() {
    setIsOpen(false);
  }

  return (
    <>
      {/* Subtle floating trigger button */}
      <button
        ref={triggerRef}
        className="feedback-trigger"
        onClick={open}
        aria-label="Feedback geven"
        aria-haspopup="dialog"
        title="Feedback geven"
        type="button"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-label="Feedback icoon"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>Feedback</span>
      </button>

      {/* Backdrop */}
      {isOpen && <div className="feedback-backdrop" onClick={close} />}

      {/* Modal */}
      {isOpen && (
        <div
          className="feedback-modal feedback-modal--open"
          role="dialog"
          aria-modal="true"
          aria-label="Feedback formulier"
          onKeyDown={handleKeyDown}
        >
        <div className="feedback-modal-header">
          <h3>Feedback</h3>
          <button ref={closeButtonRef} className="feedback-close" onClick={close} aria-label="Sluiten" autoFocus>
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
      )}
    </>
  );
}
