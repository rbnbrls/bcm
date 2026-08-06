import { describe, expect, it } from "vitest";
import { computeContentHash } from "@/lib/workflow-studio/definition-repository";

describe("computeContentHash", () => {
  it("produces the same hash for semantically equal graphs regardless of input order", () => {
    const nodesA = [
      {
        id: "node-1",
        nodeKey: "start",
        blockType: "manual_start",
        blockContractVersion: 1,
        configuration: { foo: 1 },
        positionX: 0,
        positionY: 0,
      },
      {
        id: "node-2",
        nodeKey: "end",
        blockType: "end",
        blockContractVersion: 1,
        configuration: {},
        positionX: 1,
        positionY: 1,
      },
    ];
    const nodesB = [...nodesA].reverse();
    const edgesA = [
      {
        id: "edge-1",
        edgeKey: "e1",
        sourceNodeId: "node-1",
        sourcePort: "out",
        targetNodeId: "node-2",
        targetPort: "in",
        condition: null,
      },
    ];
    const hash1 = computeContentHash({ nodes: nodesA, edges: edgesA, roleBindings: [] });
    const hash2 = computeContentHash({ nodes: nodesB, edges: edgesA, roleBindings: [] });
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes the hash when the configuration changes", () => {
    const base = {
      id: "n1",
      nodeKey: "start",
      blockType: "manual_start",
      blockContractVersion: 1,
      positionX: 0,
      positionY: 0,
    };
    const hash1 = computeContentHash({
      nodes: [{ ...base, configuration: { foo: 1 } }],
      edges: [],
      roleBindings: [],
    });
    const hash2 = computeContentHash({
      nodes: [{ ...base, configuration: { foo: 2 } }],
      edges: [],
      roleBindings: [],
    });
    expect(hash1).not.toBe(hash2);
  });
});
