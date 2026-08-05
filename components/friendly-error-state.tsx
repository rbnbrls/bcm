"use client";

import Link from "next/link";

type FriendlyErrorStateProps = {
  eyebrow: string;
  title: string;
  message: string;
  detail?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function FriendlyErrorState({
  eyebrow,
  title,
  message,
  detail,
  primaryHref = "/changes",
  primaryLabel = "Naar changes",
  secondaryHref = "/",
  secondaryLabel = "Naar dashboard",
  onRetry,
  retryLabel = "Probeer opnieuw",
}: FriendlyErrorStateProps) {
  return (
    <main className="page-shell friendly-error" role="alert">
      <section className="friendly-error-card">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{message}</p>
        {detail && <code className="friendly-error-detail">{detail}</code>}
        <div className="friendly-error-actions">
          {onRetry && (
            <button className="button button-primary" onClick={onRetry} type="button">
              {retryLabel}
            </button>
          )}
          <Link className={onRetry ? "button button-secondary" : "button button-primary"} href={primaryHref}>
            {primaryLabel}
          </Link>
          <Link className="button button-ghost" href={secondaryHref}>
            {secondaryLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}
