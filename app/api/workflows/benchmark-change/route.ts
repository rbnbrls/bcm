import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getFeatureFlagSnapshot } from "@/lib/feature-flags";
import { getIdentityContext } from "@/lib/identity/request";
import { captureError } from "@/lib/sentry-helper";
import { sql } from "@/lib/db";
import {
  WorkflowDefinitionRepository,
  type SqlExecutor,
} from "@/lib/workflow-studio/definition-repository";
import {
  WorkflowRuntimeEngine,
  type WorkflowEngineResult,
} from "@/lib/workflow-studio/runtime-engine";
import { WorkflowRuntimeStartService } from "@/lib/workflow-studio/runtime-start-service";
import { PostgresWorkflowRuntimeStore } from "@/lib/workflow-studio/runtime-postgres-store";
import { decideWorkflowRuntimeCutover } from "@/lib/workflow-studio/runtime-cutover";
import { createWorkflowRuntimeTrackingChangeRequest } from "@/lib/db";
import { authorizeWorkflowPermission } from "@/lib/workflow-studio-authorization";
import { getIdentityClientScope } from "@/lib/workflow-studio-authorization";
import type { IdentityContext } from "@/lib/identity/types";
import type { WorkflowVariableAssignment } from "@/lib/workflow-studio/runtime-variables";

export const dynamic = "force-dynamic";

const benchmarkChangeRequestSchema = z.object({
  clientCode: z.string().trim().regex(/^[A-Z0-9]{1,3}$/, "Selecteer een bestaande klant."),
  primaryAccountId: z.string().trim().min(3, "Selecteer een bestaande portefeuille."),
  requestedBenchmarkCode: z.string().trim().min(1, "Selecteer een bestaande SOLL-benchmark."),
  requestedBy: z.string().trim().min(2, "Vul de naam van de aanvrager in."),
  rationale: z.string().trim().min(10, "Licht de reden van de wijziging in minimaal 10 tekens toe."),
  effectiveDate: z.string().date("Kies een geldige ingangsdatum."),
});

type BenchmarkChangeRequest = z.infer<typeof benchmarkChangeRequestSchema>;

function validateClientScope(identity: IdentityContext): { tenant: string; businessUnit: string; clientIds: string[] } {
  if (!identity.tenant || !identity.businessUnit) {
    throw new Error("Identiteit heeft geen tenant/businessUnit scope");
  }
  const clientIds = getIdentityClientScope(identity) ?? [];
  if (clientIds.length === 0) {
    throw new Error("Identiteit heeft geen client scope");
  }
  return {
    tenant: identity.tenant,
    businessUnit: identity.businessUnit,
    clientIds,
  };
}

async function ensureBenchmarkWorkflowExists(sql: SqlExecutor, scope: { tenant: string; businessUnit: string; clientIds: string[] }): Promise<string> {
  // Check if workflow definition already exists
  const repository = new WorkflowDefinitionRepository(sql);
  
  const existingDefs = await sql`
    SELECT id FROM workflow_definition 
    WHERE slug = 'benchmark-wijziging' 
    AND tenant = ${scope.tenant} 
    AND business_unit = ${scope.businessUnit}
    LIMIT 1
  `;
  
  if (existingDefs.length > 0) {
    const defId = existingDefs[0].id;
    // Get the latest published version
    const versions = await sql`
      SELECT id, version_number FROM workflow_version
      WHERE workflow_definition_id = ${defId} AND status = 'published'
      ORDER BY version_number DESC
      LIMIT 1
    `;
    if (versions.length > 0) {
      return versions[0].id;
    }
  }

  // Create workflow definition using the compatibility compiler approach
  const defId = randomUUID();
  const versionId = randomUUID();
  const now = new Date().toISOString();
  
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as SqlExecutor;
    // Create workflow definition
    await tx`
      INSERT INTO workflow_definition (
        id, tenant, business_unit, client_ids, slug, name, description,
        category, tags, catalog_description, cost_model, owner_user_id, status,
        created_at, updated_at
      ) VALUES (
        ${defId}, ${scope.tenant}, ${scope.businessUnit}, ${scope.clientIds},
        'benchmark-wijziging', 'Benchmarkwijziging',
        'Benchmarkwijziging op een bestaande portefeuilleconfiguratie met goedkeuring door account manager',
        'change', '{"benchmark","portfolio"}',
        'Benchmarkwijziging op een bestaande portefeuilleconfiguratie; account manager keurt de IST/SOLL-wijziging goed.',
        '{"baseCost":0,"currency":"EUR","description":""}',
        'system', 'published',
        ${now}, ${now}
      )
      ON CONFLICT (tenant, business_unit, slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        catalog_description = EXCLUDED.catalog_description,
        cost_model = EXCLUDED.cost_model,
        status = EXCLUDED.status,
        updated_at = ${now}
      RETURNING id
    `;
    
    // Create workflow version
    const contentHash = "a".repeat(64); // placeholder - will be computed properly on publish
    await tx`
      INSERT INTO workflow_version (
        id, workflow_definition_id, version_number, schema_version, status,
        content_hash, revision, published_at, published_by_user_id, created_at, updated_at
      ) VALUES (
        ${versionId}, ${defId}, 1, 1, 'published',
        ${contentHash}, 1, ${now}, 'system', ${now}, ${now}
      )
    `;
    
    // Create nodes
    const startNodeId = randomUUID();
    const lookupNodeId = randomUUID();
    const formNodeId = randomUUID();
    const approvalNodeId = randomUUID();
    const changeRequestNodeId = randomUUID();
    const endNodeId = randomUUID();
    
    // manual_start node
    await tx`
      INSERT INTO workflow_node (
        id, workflow_version_id, node_key, block_type, block_contract_version,
        configuration, position_x, position_y, created_at, updated_at
      ) VALUES (
        ${startNodeId}, ${versionId}, 'start', 'manual_start', 1,
        '{"label": "Handmatige start"}'::jsonb, 0, 0, ${now}, ${now}
      )
    `;
    
    // client_config_lookup node — narrows the HOR client scope to the single
    // portfolio_configuration the change manager selected on the form. The
    // submitted primaryAccountId (e.g. HOR*EQACX*EIG) is the stable identity
    // of the portfolio_configuration row, so filtering on primary_account_id
    // yields exactly one record even when the client has multiple portfolios
    // (known env issue #5: HOR has HORRP + HORMP).
    await tx`
      INSERT INTO workflow_node (
        id, workflow_version_id, node_key, block_type, block_contract_version,
        configuration, position_x, position_y, created_at, updated_at
      ) VALUES (
        ${lookupNodeId}, ${versionId}, 'lookup_portfolio', 'client_config_lookup', 1,
        '{
          "resourceId": "portfolio_configuration",
          "filters": [
            {"attributeId": "primary_account_id", "source": "variable", "variableId": "portfolio_id"}
          ],
          "displayFields": ["primary_account_id", "client_code", "portfolio_code", "benchmark_code"],
          "outputVariable": "ist_portfolio",
          "selection": "one"
        }'::jsonb, 200, 0, ${now}, ${now}
      )
    `;
    
    // form node
    await tx`
      INSERT INTO workflow_node (
        id, workflow_version_id, node_key, block_type, block_contract_version,
        configuration, position_x, position_y, created_at, updated_at
      ) VALUES (
        ${formNodeId}, ${versionId}, 'form_request', 'form', 1,
        '{
          "title": "Benchmarkwijziging",
          "description": "Benchmarkwijziging op een bestaande portefeuilleconfiguratie; account manager keurt de IST/SOLL-wijziging goed.",
          "fields": [
            {"id": "portfolio_id", "label": "Portefeuille", "type": "text", "required": true},
            {"id": "requested_benchmark_id", "label": "Gewenste benchmark", "type": "select", "required": true, "options": [{"value": "lookup", "label": "Opzoeken in benchmarkcatalogus"}]},
            {"id": "effective_date", "label": "Ingangsdatum", "type": "date", "required": true},
            {"id": "rationale", "label": "Reden wijziging", "type": "longtext", "required": true}
          ]
        }'::jsonb, 400, 0, ${now}, ${now}
      )
    `;
    
    // approval node
    await tx`
      INSERT INTO workflow_node (
        id, workflow_version_id, node_key, block_type, block_contract_version,
        configuration, position_x, position_y, created_at, updated_at
      ) VALUES (
        ${approvalNodeId}, ${versionId}, 'approval_account_manager', 'approval', 1,
        '{
          "roleId": "account_manager",
          "title": "Goedkeuring door Account Manager",
          "instructions": "Bevestig dat de aanvraag akkoord is volgens het mandaat van Account Manager.",
          "requireCommentOnApprove": true,
          "requireCommentOnReject": true,
          "requireCommentOnReturn": true
        }'::jsonb, 600, 0, ${now}, ${now}
      )
    `;
    
    // change_request node
    await tx`
      INSERT INTO workflow_node (
        id, workflow_version_id, node_key, block_type, block_contract_version,
        configuration, position_x, position_y, created_at, updated_at
      ) VALUES (
        ${changeRequestNodeId}, ${versionId}, 'apply_change', 'change_request', 1,
        '{
          "resourceId": "portfolio_configuration",
          "operation": "UPDATE",
          "attributeMappings": [
            {"attributeId": "benchmark_code", "ist": {"snapshotVariableId": "ist_portfolio", "snapshotAttributeId": "benchmark_code"}, "soll": {"variableId": "requested_benchmark_id"}}
          ],
          "effectiveDateVariable": "effective_date",
          "rationaleVariable": "rationale"
        }'::jsonb, 800, 0, ${now}, ${now}
      )
    `;
    
    // end node
    await tx`
      INSERT INTO workflow_node (
        id, workflow_version_id, node_key, block_type, block_contract_version,
        configuration, position_x, position_y, created_at, updated_at
      ) VALUES (
        ${endNodeId}, ${versionId}, 'end', 'end', 1,
        '{"outcome": "completed", "label": "Einde"}'::jsonb, 1000, 0, ${now}, ${now}
      )
    `;
    
    // Create edges
    await tx`
      INSERT INTO workflow_edge (
        id, workflow_version_id, edge_key, source_node_id, source_port,
        target_node_id, target_port, condition, created_at, updated_at
      ) VALUES
        (${randomUUID()}, ${versionId}, 'start_to_lookup', ${startNodeId}, 'out', ${lookupNodeId}, 'in', NULL, ${now}, ${now}),
        (${randomUUID()}, ${versionId}, 'lookup_to_form', ${lookupNodeId}, 'out', ${formNodeId}, 'in', NULL, ${now}, ${now}),
        (${randomUUID()}, ${versionId}, 'form_to_approval', ${formNodeId}, 'out', ${approvalNodeId}, 'in', NULL, ${now}, ${now}),
        (${randomUUID()}, ${versionId}, 'approval_to_apply', ${approvalNodeId}, 'approved', ${changeRequestNodeId}, 'in', NULL, ${now}, ${now}),
        (${randomUUID()}, ${versionId}, 'apply_to_end', ${changeRequestNodeId}, 'out', ${endNodeId}, 'in', NULL, ${now}, ${now})
    `;
    
    // Create role bindings
    await tx`
      INSERT INTO workflow_role_binding (
        id, workflow_version_id, workflow_role, identity_group, permissions,
        tenant, business_unit, client_ids, created_at, updated_at
      ) VALUES
        (${randomUUID()}, ${versionId}, 'change_manager', 'bcm:role:change_manager', '{"workflow:start"}', ${scope.tenant}, ${scope.businessUnit}, ${scope.clientIds}, ${now}, ${now}),
        (${randomUUID()}, ${versionId}, 'account_manager', 'bcm:role:account_manager', '{"workflow:approve"}', ${scope.tenant}, ${scope.businessUnit}, ${scope.clientIds}, ${now}, ${now})
    `;
  });
  
  return versionId;
}

export async function POST(request: NextRequest) {
  try {
    const flags = getFeatureFlagSnapshot();
    if (!flags["workflow_runtime.start"]) {
      return NextResponse.json(
        { error: "Workflow runtime is nog niet ingeschakeld. Neem contact op met de beheerder." },
        { status: 503 }
      );
    }

    if (!sql) {
      return NextResponse.json(
        { error: "Database niet beschikbaar." },
        { status: 503 }
      );
    }

    const identity = await getIdentityContext();
    
    // Validate authorization
    const permission = authorizeWorkflowPermission(identity, "workflow:start");
    if (!permission.authorized) {
      return NextResponse.json(
        { error: permission.message },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = benchmarkChangeRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: "Validatiefout", 
          issues: validation.error.issues.map((issue) => issue.message),
          fieldErrors: Object.fromEntries(
            validation.error.issues
              .filter((issue) => issue.path.length > 0)
              .map((issue) => [issue.path[0] as string, issue.message])
          )
        },
        { status: 400 }
      );
    }

    const input = validation.data;
    const scope = validateClientScope(identity);

    // Ensure the benchmark workflow exists and get the version ID
    const workflowVersionId = await ensureBenchmarkWorkflowExists(sql, scope);

    // Prepare the workflow start
    const repository = new WorkflowDefinitionRepository(sql);
    const startService = new WorkflowRuntimeStartService(
      repository,
      new WorkflowRuntimeEngine(new PostgresWorkflowRuntimeStore(sql))
    );

    const prepared = await startService.prepare(identity, workflowVersionId);
    if (!prepared.ok) {
      return NextResponse.json(
        { error: prepared.message, code: prepared.code },
        { status: 400 }
      );
    }

    const cutover = decideWorkflowRuntimeCutover(
      { definitionId: prepared.value.definitionId, versionId: prepared.value.workflowVersionId },
      { globalRuntimeStartEnabled: flags["workflow_runtime.start"] }
    );
    
    if (cutover.mode !== "runtime") {
      return NextResponse.json(
        { error: "Deze workflowversie staat nog op classic; gebruik de klassieke aanvraagroute." },
        { status: 400 }
      );
    }

    // Build form values + start variables. The lookup node filters
    // portfolio_configuration on primary_account_id = portfolio_id, so the
    // submitted primaryAccountId must be available as an instance variable
    // before the form node runs.
    const values: Record<string, unknown> = {
      portfolio_id: input.primaryAccountId,
      requested_benchmark_id: input.requestedBenchmarkCode,
      effective_date: input.effectiveDate,
      rationale: input.rationale,
    };

    const variables: Readonly<WorkflowVariableAssignment[]> = [
      { name: "portfolio_id", dataType: "string", value: input.primaryAccountId, classification: "internal" },
      { name: "requested_benchmark_id", dataType: "string", value: input.requestedBenchmarkCode, classification: "internal" },
      { name: "effective_date", dataType: "date", value: input.effectiveDate, classification: "internal" },
      { name: "rationale", dataType: "string", value: input.rationale, classification: "internal" },
    ];

    // Start the workflow
    const idempotencyKey = randomUUID();
    const correlationId = randomUUID();
    const occurredAt = new Date().toISOString();

    const started = await startService.start(identity, {
      workflowVersionId,
      idempotencyKey,
      correlationId,
      values,
      variables,
      occurredAt,
    });

    if (!started.ok) {
      return NextResponse.json(
        { error: started.message, code: started.code },
        { status: 400 }
      );
    }

    // Create legacy change request tracking (best effort)
    try {
      await createWorkflowRuntimeTrackingChangeRequest({
        workflowInstanceId: started.value.instance.instanceId,
        workflowVersionId: prepared.value.workflowVersionId,
        definitionId: prepared.value.definitionId,
        slug: prepared.value.slug,
        name: prepared.value.name,
        description: prepared.value.description,
        catalogDescription: prepared.value.catalogDescription,
        category: prepared.value.category,
        costModel: prepared.value.costModel,
        forms: prepared.value.forms,
        values,
        clientIds: prepared.value.scope.clientIds ?? null,
        requestedBy: identity.userId,
        occurredAt,
      });
    } catch (trackingError) {
      captureError(trackingError, {
        endpoint: "/api/workflows/benchmark-change",
        phase: "legacy_tracking_change_request",
        workflowVersionId: prepared.value.workflowVersionId,
        definitionId: prepared.value.definitionId,
      });
    }

    return NextResponse.json({
      success: true,
      instanceId: started.value.instance.instanceId,
      deduplicated: started.value.deduplicated,
      message: started.value.deduplicated
        ? "Deze aanvraag was al gestart; de bestaande instance is teruggegeven."
        : "De benchmarkwijziging aanvraag is gestart en staat nu in afwachting van goedkeuring.",
    });
  } catch (error) {
    captureError(error, { route: "/api/workflows/benchmark-change", method: "POST", phase: "request" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Interne serverfout" },
      { status: 500 }
    );
  }
}