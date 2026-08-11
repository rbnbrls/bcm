import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { sql } from "@/lib/db";
import { getFeatureFlagSnapshot } from "@/lib/feature-flags";
import { getIdentityContext } from "@/lib/identity/request";
import { WorkflowDefinitionRepository } from "@/lib/workflow-studio/definition-repository";
import { WorkflowRuntimeEngine } from "@/lib/workflow-studio/runtime-engine";
import { PostgresWorkflowRuntimeStore } from "@/lib/workflow-studio/runtime-postgres-store";
import { WorkflowRuntimeStartService } from "@/lib/workflow-studio/runtime-start-service";
import { decideWorkflowRuntimeCutover } from "@/lib/workflow-studio/runtime-cutover";
import { WorkflowRuntimeStartForm } from "./workflow-runtime-start-form";

export default async function WorkflowRuntimeStartPage({ params }: { params: Promise<{ instanceId: string }> }) {
  const flags = getFeatureFlagSnapshot();
  if (!flags["workflow_runtime.start"]) redirect("/change-catalog");
  if (!sql) redirect("/change-catalog?error=workflowdatabase-niet-beschikbaar");
  const { instanceId: versionId } = await params;
  const identity = await getIdentityContext();
  const service = new WorkflowRuntimeStartService(
    new WorkflowDefinitionRepository(sql),
    new WorkflowRuntimeEngine(new PostgresWorkflowRuntimeStore(sql)),
  );
  const prepared = await service.prepare(identity, versionId);
  if (!prepared.ok) {
    if (prepared.code === "version_not_found" || prepared.code === "definition_not_startable") notFound();
    redirect(`/change-catalog?error=${encodeURIComponent(prepared.message)}`);
  }
  const model = prepared.value;
  const cutover = decideWorkflowRuntimeCutover({
    definitionId: model.definitionId,
    versionId: model.workflowVersionId,
  }, { globalRuntimeStartEnabled: flags["workflow_runtime.start"] });
  if (cutover.mode !== "runtime") redirect("/change-catalog?error=workflow-runtime-niet-ingeschakeld-voor-deze-versie");
  const formatter = new Intl.NumberFormat("nl-NL", { style: "currency", currency: model.costModel.currency });

  return <div className="page-shell workflow-runtime-start-page">
    <header className="page-intro">
      <div>
        <p className="eyebrow"><Link href="/change-catalog">CHANGE CATALOGUS</Link> · WORKFLOW STARTEN</p>
        <h1>{model.name}</h1>
        <p>{model.catalogDescription || model.description}</p>
      </div>
      <dl className="workflow-runtime-summary">
        <div><dt>Versie</dt><dd>v{model.versionNumber}</dd></div>
        <div><dt>Basiskosten</dt><dd>{formatter.format(model.costModel.baseCost)}</dd></div>
        <div><dt>Scope</dt><dd>{model.scope.clientIds?.length ? `${model.scope.clientIds.length} client(s)` : model.scope.businessUnit}</dd></div>
      </dl>
    </header>
    <aside className="workflow-runtime-version-note">
      Deze aanvraag wordt onveranderlijk gekoppeld aan versie {model.versionNumber} · <code>sha256:{model.contentHash.slice(0, 12)}…</code> · rollback naar classic blijft via feature flag beschikbaar.
    </aside>
    <WorkflowRuntimeStartForm
      workflowVersionId={model.workflowVersionId}
      idempotencyKey={randomUUID()}
      correlationId={randomUUID()}
      forms={model.forms}
    />
  </div>;
}
