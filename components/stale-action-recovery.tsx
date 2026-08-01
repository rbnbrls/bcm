"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Client-side recovery for UnrecognizedActionError (issue #293).
 *
 * Next.js server action IDs are salted with the build-time encryption key.
 * A deploy that changes that key invalidates every in-flight action reference,
 * and a stale browser tab (or CDN-cached bundle) then submits an action ID the
 * new server does not know. The server answers POST /… with 404 and the
 * `x-nextjs-action-not-found: 1` header, and React throws UnrecognizedActionError.
 *
 * This component patches `window.fetch` once and watches for that exact
 * contract on server-action POSTs. On detection it shows a transparent banner
 * and reloads the page once (guarded by sessionStorage so we never loop).
 * After the reload the client fetches fresh chunks with the current action IDs.
 */

const RELOAD_GUARD_KEY = "bcm:stale-action-reload";

/** True when the fetch call is a server-action submission (Next-Action header). */
function isServerActionRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const headers = input instanceof Request
    ? input.headers
    : new Headers(init?.headers);
  return headers.has("Next-Action");
}

/** True when the response is the "server action not found" contract. */
export function isStaleActionResponse(response: Response): boolean {
  return (
    response.status === 404 &&
    response.headers.get("x-nextjs-action-not-found") === "1"
  );
}

export function StaleActionRecovery() {
  const [showBanner, setShowBanner] = useState(false);
  const [autoReloadScheduled, setAutoReloadScheduled] = useState(false);
  const patchedRef = useRef(false);

  useEffect(() => {
    if (patchedRef.current) return;
    patchedRef.current = true;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (isServerActionRequest(input, init) && isStaleActionResponse(response)) {
        // A stale client hit a server that does not know its action.
        // Recover transparently: banner + one auto-reload per session.
        setShowBanner(true);
        if (!sessionStorage.getItem(RELOAD_GUARD_KEY)) {
          sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
          setAutoReloadScheduled(true);
          window.setTimeout(() => window.location.reload(), 1500);
        }
      }
      return response;
    };
  }, []);

  if (!showBanner) return null;

  return (
    <div className="stale-action-banner" role="status">
      <span>
        Er is een nieuwe versie beschikbaar —{" "}
        {autoReloadScheduled ? "de pagina wordt herladen…" : "herlaad de pagina"}
      </span>
      <button type="button" className="button button-primary button-small" onClick={() => window.location.reload()}>
        Herladen
      </button>
    </div>
  );
}
