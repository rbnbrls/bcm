"use client";

import type { ChangeTypeConfig } from "@/lib/types";
import { generateMermaidFlowchart } from "@/lib/change-type-catalog";
import { MermaidRenderer } from "@/components/mermaid-renderer";

type Props = {
  config: ChangeTypeConfig;
};

/**
 * A workflow diagram for a change type, shown on the change detail page.
 *
 * Displays the process flow with a header explaining the diagram.
 */
export function ChangeTypeWorkflow({ config }: Props) {
  const mermaidDefinition = generateMermaidFlowchart(config);

  return (
    <div className="detail-workflow" style={{
      background: "#fbfcfa",
      border: "1px solid var(--line)",
      borderRadius: 10,
      padding: "16px 20px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>PROCESFLOW</p>
          <h2 style={{ fontSize: 16, letterSpacing: "-.03em", margin: "4px 0 0" }}>
            Stappen en afhankelijkheden voor {config.name.toLowerCase()}
          </h2>
        </div>
      </div>
      <div className="change-type-flowchart">
        <MermaidRenderer definition={mermaidDefinition} />
      </div>
    </div>
  );
}
