import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { sql } from "@/lib/db";
import { WorkflowRuntimeEngine, type WorkflowRuntimeNodeRecord } from "@/lib/workflow-studio/runtime-engine";
import { PostgresWorkflowRuntimeStore } from "@/lib/workflow-studio/runtime-postgres-store";

const HAS_DB = Boolean(process.env.DATABASE_URL && sql);

describe.runIf(HAS_DB)("Workflow runtime engine PostgreSQL integration", () => {
  const definitionIds: string[] = [];

  afterAll(async () => {
    if (!sql) return;
    for (const id of definitionIds) {
      await sql`UPDATE workflow_definition SET status = 'archived', updated_at = now() WHERE id = ${id}`;
    }
  });

  async function createPublishedGraph() {
    if (!sql) throw new Error("DATABASE_URL ontbreekt");
    const tenant = `runtime-engine-${randomUUID()}`;
    const [definition] = await sql`
      INSERT INTO workflow_definition (tenant, business_unit, slug, name, owner_user_id)
      VALUES (${tenant}, 'runtime-engine', ${`engine-${randomUUID()}`}, 'Engine integration', 'test-user')
      RETURNING id
    `;
    definitionIds.push(String(definition.id));
    const [version] = await sql`
      INSERT INTO workflow_version (workflow_definition_id) VALUES (${definition.id}) RETURNING id
    `;
    const [start] = await sql`
      INSERT INTO workflow_node (workflow_version_id, node_key, block_type, configuration)
      VALUES (${version.id}, 'start', 'manual_start', '{}'::jsonb) RETURNING id
    `;
    const [end] = await sql`
      INSERT INTO workflow_node (workflow_version_id, node_key, block_type, configuration)
      VALUES (${version.id}, 'end', 'end', '{"outcome":"completed"}'::jsonb) RETURNING id
    `;
    await sql`
      INSERT INTO workflow_edge (
        workflow_version_id, edge_key, source_node_id, source_port, target_node_id, target_port, condition
      ) VALUES (
        ${version.id}, 'start_end', ${start.id}, 'out', ${end.id}, 'in',
        ${sql.json({ kind: "condition", variableId: "amount", valueType: "number", operator: "greater_than", value: 100 })}
      )
    `;
    await sql`
      UPDATE workflow_version SET status = 'published', content_hash = ${"c".repeat(64)},
        published_at = now(), published_by_user_id = 'test-user'
      WHERE id = ${version.id}
    `;
    return { tenant, versionId: String(version.id) };
  }

  it("serializes commands, deduplicates deliveries and completes after a process-style resume", async () => {
    if (!sql) throw new Error("DATABASE_URL ontbreekt");
    const context = await createPublishedGraph();
    const engine = new WorkflowRuntimeEngine(new PostgresWorkflowRuntimeStore(sql));
    const instanceId = randomUUID();
    const actor = { type: "system", id: "integration-worker" } as const;
    const occurredAt = new Date().toISOString();
    const startInput = {
      workflowVersionId: context.versionId,
      instanceId,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
      actor,
      occurredAt,
    } as const;

    const started = await engine.start(startInput);
    const duplicateStart = await engine.start({ ...startInput, instanceId: randomUUID() });
    expect(started.instance.status).toBe("running");
    expect(duplicateStart).toMatchObject({ deduplicated: true, instance: { instanceId } });

    for (const suffix of ["start", "end"]) {
      const resumedEngine = new WorkflowRuntimeEngine(new PostgresWorkflowRuntimeStore(sql));
      const claimed = await resumedEngine.claimNext({
        instanceId,
        commandId: `claim-${suffix}-${instanceId}`,
        workerId: "integration-worker",
        leaseDurationMs: 60_000,
        correlationId: startInput.correlationId,
        occurredAt: new Date().toISOString(),
      });
      expect(claimed).not.toBeNull();
      const node = claimed!.state as WorkflowRuntimeNodeRecord;
      const completeCommand = {
        type: "succeed_node",
        commandId: `complete-${suffix}-${instanceId}`,
        instanceId,
        nodeInstanceId: node.nodeInstanceId,
        expectedStatus: "running",
        actor,
        correlationId: startInput.correlationId,
        occurredAt: new Date().toISOString(),
        ...(suffix === "start" ? { outputVariables: [{ name: "amount", dataType: "number" as const, value: 250 }] } : {}),
      } as const;
      await resumedEngine.execute(completeCommand);
      const duplicate = await resumedEngine.execute(completeCommand);
      expect(duplicate.deduplicated).toBe(true);
    }

    const [instanceRow] = await sql`SELECT status FROM workflow_instance WHERE id = ${instanceId}`;
    const [counts] = await sql`
      SELECT
        (SELECT count(*)::int FROM workflow_node_instance WHERE workflow_instance_id = ${instanceId}) AS nodes,
        (SELECT count(*)::int FROM workflow_event WHERE workflow_instance_id = ${instanceId}) AS events,
        (SELECT count(*)::int FROM workflow_variable WHERE workflow_instance_id = ${instanceId}) AS variables
    `;
    expect(instanceRow.status).toBe("completed");
    expect(Number(counts.nodes)).toBe(2);
    expect(Number(counts.events)).toBe(8);
    expect(Number(counts.variables)).toBe(1);
  });
});
