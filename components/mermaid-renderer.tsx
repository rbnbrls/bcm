"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Mermaid diagram renderer.
 *
 * Renders a mermaid flowchart definition on the client side.
 * Shows a text placeholder while loading.
 */
export function MermaidRenderer({ definition }: { definition: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = await import("mermaid");

        mermaid.default.initialize({
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

        if (!containerRef.current || cancelled) return;

        // Generate unique id for this diagram
        const uid = `mermaid-${Date.now()}-${key}`;

        const { svg } = await mermaid.default.render(uid, definition);

        if (!containerRef.current || cancelled) return;
        containerRef.current.innerHTML = svg;
        setRendered(true);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Diagram laden mislukt");
          setRendered(false);
        }
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [definition, key]);

  // Re-render on error
  const handleRetry = () => {
    setError(null);
    setRendered(false);
    setKey((k) => k + 1);
  };

  if (error) {
    return (
      <div style={{ fontSize: 11, color: "var(--muted)", padding: 8, textAlign: "center" }}>
        <span>⚠ {error}</span>
        <button
          onClick={handleRetry}
          style={{
            display: "inline-block", marginLeft: 8, border: 0,
            background: "var(--panel)", cursor: "pointer", fontSize: 11,
            padding: "2px 8px", borderRadius: 4,
          }}
        >
          Opnieuw
        </button>
      </div>
    );
  }

  if (!rendered) {
    return (
      <div
        style={{
          fontSize: 11, color: "var(--muted)", padding: 12, textAlign: "center",
          fontStyle: "italic",
        }}
      >
        Procesoverzicht laden...
      </div>
    );
  }

  return <div ref={containerRef} />;
}
