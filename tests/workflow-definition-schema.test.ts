import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCHEMA_SOURCES = [
  path.resolve(__dirname, "..", "db", "init.sql"),
  path.resolve(__dirname, "..", "scripts", "migrate.mjs"),
  path.resolve(__dirname, "..", "lib", "db.ts"),
];

const WORKFLOW_TABLES = [
  "workflow_definition",
  "workflow_version",
  "workflow_node",
  "workflow_edge",
  "workflow_role_binding",
] as const;

describe("Workflow Studio definition schema contract", () => {
  let sources: Array<{ file: string; content: string }>;

  beforeAll(async () => {
    sources = await Promise.all(SCHEMA_SOURCES.map(async (file) => ({
      file,
      content: await fs.readFile(file, "utf8"),
    })));
  });

  it("keeps all five definition tables in every schema entry point", () => {
    for (const { file, content } of sources) {
      for (const table of WORKFLOW_TABLES) {
        expect(content, `${path.basename(file)} is missing ${table}`).toContain(
          `CREATE TABLE IF NOT EXISTS ${table} (`,
        );
      }
    }
  });

  it("keeps migration verification aligned with its retry DDL", () => {
    const migrate = sources.find(({ file }) => file.endsWith("scripts/migrate.mjs"))!.content;
    const requiredBlock = migrate.match(/const REQUIRED_TABLES = \[([\s\S]*?)\];/)?.[1] ?? "";
    const ddlBlock = migrate.match(/const DDL_STATEMENTS = \[([\s\S]*?)\n    \];/)?.[1] ?? "";
    const required = [...requiredBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    const ddlTables = [...ddlBlock.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(/g)]
      .map((match) => match[1]);
    expect(required).toEqual(ddlTables);
  });

  it("stores scope, lifecycle and publication metadata", () => {
    for (const { content } of sources) {
      expect(content).toContain("tenant text NOT NULL");
      expect(content).toContain("business_unit text NOT NULL");
      expect(content).toContain("client_ids text[]");
      expect(content).toContain("version_number integer NOT NULL");
      expect(content).toContain("schema_version integer NOT NULL DEFAULT 1");
      expect(content).toContain("content_hash text");
      expect(content).toContain("published_at timestamptz");
      expect(content).toContain("published_by_user_id text");
      expect(content).toContain("revision bigint NOT NULL DEFAULT 1");
    }
  });

  it("enforces one draft and increasing version numbers per definition", () => {
    for (const { content } of sources) {
      expect(content).toContain("uq_workflow_version_number UNIQUE (workflow_definition_id, version_number)");
      expect(content).toContain("uq_workflow_version_single_draft");
      expect(content).toContain("workflow_assign_version_number()");
      expect(content).toContain("pg_advisory_xact_lock");
      expect(content).toContain("COALESCE(MAX(version_number), 0) + 1");
    }
  });

  it("pins edges to nodes from the same version", () => {
    for (const { content } of sources) {
      expect(content).toContain("uq_workflow_node_id_version UNIQUE (id, workflow_version_id)");
      expect(content).toMatch(
        /FOREIGN KEY \(source_node_id, workflow_version_id\)[\s\S]{0,120}REFERENCES workflow_node\(id, workflow_version_id\)/,
      );
      expect(content).toMatch(
        /FOREIGN KEY \(target_node_id, workflow_version_id\)[\s\S]{0,120}REFERENCES workflow_node\(id, workflow_version_id\)/,
      );
    }
  });

  it("installs immutability guards on versions and all version content", () => {
    for (const { content } of sources) {
      expect(content).toContain("workflow_guard_version_immutability()");
      expect(content).toContain("workflow_guard_version_content()");
      expect(content).toContain("trg_workflow_version_immutability");
      expect(content).toContain("trg_workflow_node_immutability");
      expect(content).toContain("trg_workflow_edge_immutability");
      expect(content).toContain("trg_workflow_role_binding_immutability");
      expect(content).toContain("Published workflow version % is immutable");
      expect(content).toContain("Content of a published workflow version is immutable");
    }
  });
});

describe.runIf(Boolean(process.env.DATABASE_URL))("Workflow Studio definition database invariants", () => {
  type Sql = import("postgres").Sql;
  let sql: Sql;

  beforeAll(async () => {
    const { default: postgres } = await import("postgres");
    sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  });

  afterAll(async () => {
    await sql.end();
  });

  async function createDefinition(tx: Sql): Promise<string> {
    const [definition] = await tx`
      INSERT INTO workflow_definition (tenant, business_unit, slug, name, owner_user_id)
      VALUES ('schema-test', 'schema-test', ${`schema-test-${randomUUID()}`}, 'Schema test', 'test-user')
      RETURNING id
    `;
    return String(definition.id);
  }

  async function createDraft(tx: Sql, definitionId: string): Promise<string> {
    const [version] = await tx`
      INSERT INTO workflow_version (workflow_definition_id)
      VALUES (${definitionId})
      RETURNING id
    `;
    return String(version.id);
  }

  async function publish(tx: Sql, versionId: string): Promise<void> {
    await tx`
      UPDATE workflow_version
      SET status = 'published',
          content_hash = ${"a".repeat(64)},
          published_at = now(),
          published_by_user_id = 'test-user'
      WHERE id = ${versionId}
    `;
  }

  it("creates every workflow table", async () => {
    const rows = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY(${[...WORKFLOW_TABLES]})
    `;
    expect(new Set(rows.map((row) => String(row.table_name)))).toEqual(new Set(WORKFLOW_TABLES));
  });

  it("keeps drafts mutable and assigns monotonically increasing version numbers", async () => {
    await expect(sql.begin(async (rawTx) => {
      // postgres.js' TransactionSql uses Omit<Sql>, which drops the call
      // signature in TypeScript even though the runtime value remains a tag.
      const tx = rawTx as unknown as Sql;
      const definitionId = await createDefinition(tx);
      const firstVersionId = await createDraft(tx, definitionId);
      await tx`
        INSERT INTO workflow_node (workflow_version_id, node_key, block_type)
        VALUES (${firstVersionId}, 'start', 'manual_start')
      `;
      await tx`
        UPDATE workflow_node SET configuration = ${tx.json({ label: "Gewijzigd" })}
        WHERE workflow_version_id = ${firstVersionId} AND node_key = 'start'
      `;
      await publish(tx, firstVersionId);
      const secondVersionId = await createDraft(tx, definitionId);
      const versions = await tx`
        SELECT version_number FROM workflow_version
        WHERE id IN (${firstVersionId}, ${secondVersionId}) ORDER BY version_number
      `;
      expect(versions.map((row) => Number(row.version_number))).toEqual([1, 2]);
      throw new Error("ROLLBACK_SCHEMA_TEST");
    })).rejects.toThrow("ROLLBACK_SCHEMA_TEST");
  });

  it.each(["version", "node", "edge", "role binding"])(
    "prevents mutation of published %s content",
    async (target) => {
      await expect(sql.begin(async (rawTx) => {
        const tx = rawTx as unknown as Sql;
        const definitionId = await createDefinition(tx);
        const versionId = await createDraft(tx, definitionId);
        const [startNode] = await tx`
          INSERT INTO workflow_node (workflow_version_id, node_key, block_type)
          VALUES (${versionId}, 'start', 'manual_start') RETURNING id
        `;
        const [endNode] = await tx`
          INSERT INTO workflow_node (workflow_version_id, node_key, block_type)
          VALUES (${versionId}, 'end', 'end') RETURNING id
        `;
        const [edge] = await tx`
          INSERT INTO workflow_edge (
            workflow_version_id, edge_key, source_node_id, source_port, target_node_id, target_port
          ) VALUES (${versionId}, 'start-end', ${startNode.id}, 'out', ${endNode.id}, 'in')
          RETURNING id
        `;
        const [binding] = await tx`
          INSERT INTO workflow_role_binding (
            workflow_version_id, workflow_role, identity_group, permissions, tenant, business_unit
          ) VALUES (
            ${versionId}, 'requester', 'bcm:role:change_manager',
            ${["workflow:start"]}, 'schema-test', 'schema-test'
          ) RETURNING id
        `;
        await publish(tx, versionId);

        if (target === "version") {
          await tx`UPDATE workflow_version SET schema_version = 2 WHERE id = ${versionId}`;
        } else if (target === "node") {
          await tx`UPDATE workflow_node SET position_x = 10 WHERE id = ${startNode.id}`;
        } else if (target === "edge") {
          await tx`DELETE FROM workflow_edge WHERE id = ${edge.id}`;
        } else {
          await tx`UPDATE workflow_role_binding SET workflow_role = 'other' WHERE id = ${binding.id}`;
        }
        throw new Error("IMMUTABILITY_GUARD_DID_NOT_FIRE");
      })).rejects.toThrow(/immutable/i);
    },
  );
});
