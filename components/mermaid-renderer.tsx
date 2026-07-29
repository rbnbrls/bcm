"use client";

import { useEffect, useState } from "react";
import mermaid from "mermaid";

let mermaidInitialized = false;

function ensureMermaidInitialized() {
  if (mermaidInitialized) return;

  mermaid.initialize({
    startOnLoad: false,
    theme: "neutral",
    themeVariables: {
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: "12px",
      primaryColor: "#dff4e9",
      primaryTextColor: "#0a513f",
      primaryBorderColor: "#0a513f",
      lineColor: "#5d6864",
      secondaryColor: "#fff3d6",
      tertiaryColor: "#e3eaf5",
      secondaryBorderColor: "#c8950c",
      tertiaryBorderColor: "#28497c",
    },
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: "basis",
    },
  });

  mermaidInitialized = true;
}

/**
 * Mermaid diagram renderer.
 *
 * Renders a mermaid flowchart definition on the client side.
 * Shows a text placeholder while loading and a retry button on error.
 */
export function MermaidRenderer({ definition }: { definition: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        ensureMermaidInitialized();

        const uid = `mermaid-${Date.now()}-${key}`;
        const result = await mermaid.render(uid, definition);

        if (cancelled) return;

        setSvg(result.svg);
        setError(null);
      } catch (err) {
        if (cancelled) return;

        setError(err instanceof Error ? err.message : "Diagram laden mislukt");
        setSvg(null);
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [definition, key]);

  const handleRetry = () => {
    setError(null);
    setSvg(null);
    setKey((k) => k + 1);
  };

  if (error) {
    return (
      <div style={{ fontSize: 11, color: "var(--muted)", padding: 8, textAlign: "center" }}>
        <span>⚠ {error}</span>
        <button
          onClick={handleRetry}
          style={{
            display: "inline-block",
            marginLeft: 8,
            border: 0,
            background: "var(--panel)",
            cursor: "pointer",
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 4,
          }}
        >
          Opnieuw
        </button>
      </div>
    );
  }

  if (!svg) {
    return (
      <div
        style={{
          fontSize: 11,
          color: "var(--muted)",
          padding: 12,
          textAlign: "center",
          fontStyle: "italic",
        }}
      >
        Procesoverzicht laden...
      </div>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}
