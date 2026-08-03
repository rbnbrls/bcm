"use client";

import { useEffect, useRef, useState } from "react";
import {
  CLIENT_CODE_PATTERN,
  PARENT_ACCOUNT_CODE_PATTERN,
  PORTFOLIO_CODE_PATTERN,
} from "@/lib/validation-rules";

export type CodeKind = "client" | "portfolio" | "parent_account";

export type UniquenessStatus =
  | "idle" // no value entered yet, or value cleared
  | "checking" // request in flight
  | "available" // code is unique — safe to submit
  | "taken" // code already exists — show inline error
  | "error"; // request failed (e.g. network) — do not block submission

export interface UniquenessResult {
  status: UniquenessStatus;
  message: string | null;
}

const PATTERNS: Record<CodeKind, RegExp> = {
  client: CLIENT_CODE_PATTERN,
  portfolio: PORTFOLIO_CODE_PATTERN,
  parent_account: PARENT_ACCOUNT_CODE_PATTERN,
};

const QUERY_PARAM: Record<CodeKind, string> = {
  client: "clientCode",
  portfolio: "portfolioCode",
  parent_account: "parentAccountCode",
};

const DEFAULT_MESSAGES: Record<CodeKind, (code: string) => string> = {
  client: (code) => `Klantcode ${code} is al in gebruik.`,
  portfolio: (code) => `Portfoliocode ${code} is al in gebruik.`,
  parent_account: (code) => `Parent account code ${code} is al in gebruik.`,
};

interface ServerResult {
  code: string;
  status: "available" | "taken" | "error";
  message: string | null;
}

/**
 * Debounced uniqueness check for a client, portfolio or parent-account code.
 *
 * Calls GET /api/validate-code-uniqueness?<kind>Code=<code> after the user
 * stops typing (default 400 ms). The result drives inline error messages on
 * onboarding and metadata forms: duplicate codes block submission, unique
 * codes pass.
 *
 * Format validation happens first — codes that do not match the DB pattern
 * are never sent to the API (they fail required/format validation instead).
 */
export function useCodeUniqueness(
  kind: CodeKind,
  value: string,
  debounceMs = 400,
): UniquenessResult {
  const code = value.trim().toUpperCase();
  const formatValid = code !== "" && PATTERNS[kind].test(code);

  const [serverResult, setServerResult] = useState<ServerResult | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!formatValid) {
      // Invalidate any in-flight request for a now-empty/invalid value.
      requestSeq.current += 1;
      return;
    }

    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      try {
        const param = QUERY_PARAM[kind];
        const res = await fetch(`/api/validate-code-uniqueness?${param}=${encodeURIComponent(code)}`);
        if (seq !== requestSeq.current) return; // stale response
        if (!res.ok) {
          setServerResult({ code, status: "error", message: null });
          return;
        }
        const data = (await res.json()) as {
          clientCodeTaken?: boolean;
          portfolioCodeTaken?: boolean;
          parentAccountCodeTaken?: boolean;
          clientCodeMessage?: string | null;
          portfolioCodeMessage?: string | null;
          parentAccountCodeMessage?: string | null;
        };
        if (seq !== requestSeq.current) return;
        const taken =
          kind === "client"
            ? Boolean(data.clientCodeTaken)
            : kind === "portfolio"
              ? Boolean(data.portfolioCodeTaken)
              : Boolean(data.parentAccountCodeTaken);
        const serverMessage =
          kind === "client"
            ? data.clientCodeMessage
            : kind === "portfolio"
              ? data.portfolioCodeMessage
              : data.parentAccountCodeMessage;
        setServerResult(
          taken
            ? { code, status: "taken", message: serverMessage ?? DEFAULT_MESSAGES[kind](code) }
            : { code, status: "available", message: null },
        );
      } catch {
        if (seq !== requestSeq.current) return;
        setServerResult({ code, status: "error", message: null });
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      requestSeq.current += 1;
    };
  }, [kind, code, formatValid, debounceMs]);

  if (!formatValid) return { status: "idle", message: null };
  if (serverResult?.code === code) {
    return { status: serverResult.status, message: serverResult.message };
  }
  // Valid code whose check has not (yet) resolved for this exact value.
  return { status: "checking", message: null };
}
