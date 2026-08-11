import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCHEMA_SOURCES = [
  path.resolve(__dirname, "..", "db", "init.sql"),
  path.resolve(__dirname, "..", "scripts", "migrate.mjs"),
  path.resolve(__dirname, "..", "lib", "db.ts"),
];

const RUNTIME_TABLES = [
  "workflow_instance",
  "workflow_node_instance",
  "workflow_task",
  "workflow_variable",
  "workflow_data_snapshot",
  "workflow_change_intent",
  "workflow_event",
  "workflow_outbox",
] as const;

describe("Workflow Studio runtime schema contract", () => {
  let sources: string[];

  beforeAll(async () => {
    sources = await Promise.all(SCHEMA_SOURCES.map((file) => fs.readFile(file, "utf8")));
  });

  it("keeps all runtime tables in every schema entry point", () => {
    for (const source of sources) {
      for (const table of RUNTIME_TABLES) {
        expect(source).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
      }
    }
  });

  it("pins the normative instance, node, task and intent status machines", () => {
    for (const source of sources) {
      expect(source).toContain(
        "status IN ('pending','running','waiting','completed','cancelled','failed','needs_intervention')",
      );
      expect(source).toContain(
        "status IN ('ready','running','waiting','succeeded','skipped','failed','needs_intervention')",
      );
      expect(source).toContain("status IN ('open','claimed','completed','cancelled','expired')");
      expect(source).toContain(
        "status IN ('draft','validated','approved','applying','applied','rejected','conflicted','failed')",
      );
    }
  });

  it("stores idempotency, correlation, deadlines, leases and bounded retries", () => {
    for (const source of sources) {
      expect(source).toContain("uq_workflow_instance_idempotency");
      expect(source).toContain("uq_workflow_node_idempotency");
      expect(source).toContain("uq_workflow_task_idempotency");
      expect(source).toContain("uq_workflow_snapshot_idempotency");
      expect(source).toContain("uq_workflow_intent_idempotency");
      expect(source).toContain("uq_workflow_event_idempotency");
      expect(source).toContain("uq_workflow_outbox_idempotency");
      expect(source).toContain("correlation_id text NOT NULL");
      expect(source).toContain("causation_id text");
      expect(source).toContain("deadline_at timestamptz");
      expect(source).toContain("next_retry_at timestamptz");
      expect(source).toContain("lease_expires_at timestamptz");
      expect(source).toContain("attempt > 0 AND max_attempts > 0 AND attempt <= max_attempts");
    }
  });

  it("assigns node attempts and event sequences transactionally", () => {
    for (const source of sources) {
      expect(source).toContain("workflow_assign_node_attempt()");
      expect(source).toContain("uq_workflow_node_attempt");
      expect(source).toContain("workflow_assign_event_sequence()");
      expect(source).toContain("uq_workflow_event_sequence");
      expect(source).toContain("pg_advisory_xact_lock");
    }
  });

  it("only starts published versions and keeps runtime references in one instance context", () => {
    for (const source of sources) {
      expect(source).toContain("workflow_require_published_version()");
      expect(source).toContain("Workflow instances require a published version");
      expect(source).toContain("uq_workflow_node_instance_context");
      expect(source).toContain("fk_workflow_task_node_instance");
      expect(source).toContain("fk_workflow_snapshot_node");
      expect(source).toContain("fk_workflow_intent_node");
      expect(source).toContain("fk_workflow_event_node");
      expect(source).toContain("workflow_validate_task_role_binding()");
    }
  });

  it("makes events and data snapshots append-only", () => {
    for (const source of sources) {
      expect(source).toContain("workflow_reject_mutation()");
      expect(source).toContain("trg_workflow_snapshot_append_only");
      expect(source).toContain("trg_workflow_event_append_only");
      expect(source).toContain("is append-only");
    }
  });

  it("defines durable workflow outbox leases, retry states and dead letters", () => {
    for (const source of sources) {
      expect(source).toContain("CREATE TABLE IF NOT EXISTS workflow_outbox");
      expect(source).toContain("kind IN ('engine','notification','integration')");
      expect(source).toContain("status IN ('pending','leased','delivered','dead_letter')");
      expect(source).toContain("dead_letter_at timestamptz");
      expect(source).toContain("last_error text");
      expect(source).toContain("idx_workflow_outbox_ready");
      expect(source).toContain("idx_workflow_outbox_event");
    }
  });
});

describe.runIf(Boolean(process.env.DATABASE_URL))("Workflow Studio runtime database invariants", () => {
  type Sql = import("postgres").Sql;
  let sql: Sql;

  beforeAll(async () => {
    const { default: postgres } = await import("postgres");
    sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  });

  afterAll(async () => {
    await sql.end();
  });

  async function createDefinitionContext(tx: Sql) {
    const [definition] = await tx`
      INSERT INTO workflow_definition (tenant, business_unit, slug, name, owner_user_id)
      VALUES ('runtime-test', 'runtime-test', ${`runtime-${randomUUID()}`}, 'Runtime test', 'test-user')
      RETURNING id
    `;
    const [version] = await tx`
      INSERT INTO workflow_version (workflow_definition_id) VALUES (${definition.id}) RETURNING id
    `;
    const [node] = await tx`
      INSERT INTO workflow_node (workflow_version_id, node_key, block_type)
      VALUES (${version.id}, 'task', 'role_task') RETURNING id
    `;
    const [binding] = await tx`
      INSERT INTO workflow_role_binding (
        workflow_version_id, workflow_role, identity_group, permissions, tenant, business_unit
      ) VALUES (
        ${version.id}, 'executor', 'bcm:role:change_manager',
        ${["workflow:tasks:execute"]}, 'runtime-test', 'runtime-test'
      ) RETURNING id
    `;
    return {
      definitionId: String(definition.id),
      versionId: String(version.id),
      nodeId: String(node.id),
      bindingId: String(binding.id),
    };
  }

  async function publish(tx: Sql, versionId: string) {
    await tx`
      UPDATE workflow_version SET status = 'published', content_hash = ${"b".repeat(64)},
        published_at = now(), published_by_user_id = 'test-user'
      WHERE id = ${versionId}
    `;
  }

  async function createInstance(tx: Sql, versionId: string) {
    const [instance] = await tx`
      INSERT INTO workflow_instance (
        workflow_version_id, tenant, business_unit, idempotency_key, correlation_id, started_by_user_id
      ) VALUES (
        ${versionId}, 'runtime-test', 'runtime-test', ${randomUUID()}, ${randomUUID()}, 'test-user'
      ) RETURNING id, correlation_id
    `;
    return { id: String(instance.id), correlationId: String(instance.correlation_id) };
  }

  it("rejects instances for mutable drafts", async () => {
    await expect(sql.begin(async (rawTx) => {
      const tx = rawTx as unknown as Sql;
      const context = await createDefinitionContext(tx);
      await createInstance(tx, context.versionId);
      throw new Error("PUBLISHED_VERSION_GUARD_DID_NOT_FIRE");
    })).rejects.toThrow(/published version/i);
  });

  it("persists the complete runtime context with ordered attempts and events", async () => {
    await expect(sql.begin(async (rawTx) => {
      const tx = rawTx as unknown as Sql;
      const context = await createDefinitionContext(tx);
      await publish(tx, context.versionId);
      const instance = await createInstance(tx, context.versionId);

      const [firstAttempt] = await tx`
        INSERT INTO workflow_node_instance (
          workflow_instance_id, workflow_version_id, workflow_node_id,
          idempotency_key, correlation_id
        ) VALUES (
          ${instance.id}, ${context.versionId}, ${context.nodeId}, ${randomUUID()}, ${instance.correlationId}
        ) RETURNING id, attempt
      `;
      await tx`
        UPDATE workflow_node_instance
        SET status = 'failed', started_at = now(), completed_at = now(), error_class = 'transient_technical'
        WHERE id = ${firstAttempt.id}
      `;
      const [secondAttempt] = await tx`
        INSERT INTO workflow_node_instance (
          workflow_instance_id, workflow_version_id, workflow_node_id,
          idempotency_key, correlation_id
        ) VALUES (
          ${instance.id}, ${context.versionId}, ${context.nodeId}, ${randomUUID()}, ${instance.correlationId}
        ) RETURNING id, attempt
      `;
      expect([Number(firstAttempt.attempt), Number(secondAttempt.attempt)]).toEqual([1, 2]);

      await tx`
        INSERT INTO workflow_task (
          workflow_instance_id, workflow_version_id, workflow_node_instance_id,
          workflow_role_binding_id, title, assignee_group, idempotency_key, correlation_id, deadline_at
        ) VALUES (
          ${instance.id}, ${context.versionId}, ${secondAttempt.id}, ${context.bindingId},
          'Controleren', 'bcm:role:change_manager', ${randomUUID()}, ${instance.correlationId}, now() + interval '1 day'
        )
      `;
      await tx`
        INSERT INTO workflow_variable (
          workflow_instance_id, source_node_instance_id, name, data_type, value, idempotency_key, correlation_id
        ) VALUES (
          ${instance.id}, ${secondAttempt.id}, 'approved', 'boolean', ${tx.json(true)}, ${randomUUID()}, ${instance.correlationId}
        )
      `;
      const [snapshot] = await tx`
        INSERT INTO workflow_data_snapshot (
          workflow_instance_id, workflow_node_instance_id, resource_id, source_record_id,
          selected_fields, concurrency_token, idempotency_key, correlation_id
        ) VALUES (
          ${instance.id}, ${secondAttempt.id}, 'client', 'client-1', ${tx.json({ name: "Client" })},
          'etag-1', ${randomUUID()}, ${instance.correlationId}
        ) RETURNING id
      `;
      await tx`
        INSERT INTO workflow_change_intent (
          workflow_instance_id, workflow_node_instance_id, workflow_data_snapshot_id,
          adapter_id, resource_id, operation, payload, idempotency_key, correlation_id
        ) VALUES (
          ${instance.id}, ${secondAttempt.id}, ${snapshot.id}, 'client-config', 'client', 'UPDATE',
          ${tx.json({ name: "Gewijzigd" })}, ${randomUUID()}, ${instance.correlationId}
        )
      `;
      const events = [];
      for (const eventType of ["instance.started", "task.created"]) {
        const [event] = await tx`
          INSERT INTO workflow_event (
            workflow_instance_id, workflow_node_instance_id, event_type,
            actor_type, actor_id, idempotency_key, correlation_id
          ) VALUES (
            ${instance.id}, ${secondAttempt.id}, ${eventType}, 'system', 'runtime-test',
            ${randomUUID()}, ${instance.correlationId}
          ) RETURNING sequence_number
        `;
        events.push(Number(event.sequence_number));
      }
      expect(events).toEqual([1, 2]);
      throw new Error("ROLLBACK_RUNTIME_TEST");
    })).rejects.toThrow("ROLLBACK_RUNTIME_TEST");
  });

  it.each(["snapshot", "event"])("keeps %s records append-only", async (target) => {
    await expect(sql.begin(async (rawTx) => {
      const tx = rawTx as unknown as Sql;
      const context = await createDefinitionContext(tx);
      await publish(tx, context.versionId);
      const instance = await createInstance(tx, context.versionId);

      if (target === "snapshot") {
        const [snapshot] = await tx`
          INSERT INTO workflow_data_snapshot (
            workflow_instance_id, resource_id, source_record_id, selected_fields,
            concurrency_token, idempotency_key, correlation_id
          ) VALUES (
            ${instance.id}, 'client', 'client-1', ${tx.json({ name: "Client" })},
            'etag-1', ${randomUUID()}, ${instance.correlationId}
          ) RETURNING id
        `;
        await tx`UPDATE workflow_data_snapshot SET concurrency_token = 'etag-2' WHERE id = ${snapshot.id}`;
      } else {
        const [event] = await tx`
          INSERT INTO workflow_event (
            workflow_instance_id, event_type, actor_type, actor_id, idempotency_key, correlation_id
          ) VALUES (
            ${instance.id}, 'instance.created', 'system', 'runtime-test', ${randomUUID()}, ${instance.correlationId}
          ) RETURNING id
        `;
        await tx`DELETE FROM workflow_event WHERE id = ${event.id}`;
      }
      throw new Error("APPEND_ONLY_GUARD_DID_NOT_FIRE");
    })).rejects.toThrow(/append-only/i);
  });
});
