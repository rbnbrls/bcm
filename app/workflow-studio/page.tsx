import Link from "next/link";
import { getIdentityContext } from "@/lib/identity/request";
import { identityHasPermission } from "@/lib/rbac";
import { sql } from "@/lib/db";
import { createWorkflowDefinitionService } from "@/lib/workflow-studio/definition-service";
import { loadWorkflowOverview } from "@/lib/workflow-studio/overview";
import { deprecateWorkflowAction } from "@/app/workflow-studio/actions";
import { WorkflowBranchDraftButton } from "@/app/workflow-studio/workflow-branch-draft-button";

type Props = { searchParams?: Promise<{ error?: string; notice?: string }> };

const statusLabels = {
  draft: "Draft",
  published: "Gepubliceerd",
  deprecated: "Uitgefaseerd",
  archived: "Gearchiveerd",
} as const;

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function WorkflowStudioPage({ searchParams }: Props) {
  const identity = await getIdentityContext();
  const canDesign = identityHasPermission(identity, "workflow:design");
  const canDeprecate = identityHasPermission(identity, "workflow:deprecate");
  const params = searchParams ? await searchParams : undefined;
  const overview = sql
    ? await loadWorkflowOverview(createWorkflowDefinitionService(sql), identity)
    : { ok: false as const, code: "repository_error" as const, message: "De database is niet beschikbaar." };

  return (
    <div className="page-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">WORKFLOW STUDIO</p>
          <h1>Workflows</h1>
          <p>Ontwerp en beheer changeprocessen zonder code.</p>
        </div>
        {canDesign ? <Link className="button button-primary" href="/workflow-studio/new">Nieuwe workflow</Link> : null}
      </div>

      {params?.notice ? <div className="approval-success" role="status">De workflow is uitgefaseerd.</div> : null}
      {params?.error ? <div className="form-errors" role="alert">Actie niet uitgevoerd: {params.error}</div> : null}

      {!overview.ok ? (
        <section className="studio-empty-panel">
          <h2>Overzicht niet beschikbaar</h2>
          <p>{overview.message}</p>
        </section>
      ) : overview.value.length === 0 ? (
        <section className="studio-empty-panel">
          <h2>Nog geen workflows</h2>
          <p>Maak een leeg proces of start vanuit een bestaande template.</p>
          {canDesign ? <Link className="button button-secondary" href="/workflow-studio/new">Eerste workflow maken</Link> : null}
        </section>
      ) : (
        <div className="studio-workflow-list" aria-label="Workflowdefinities">
          {overview.value.map(({ definition, draft, published }) => {
            const templateReference = draft
              ? `definition:${definition.id}`
              : published
                ? `version:${published.id}`
                : null;
            return (
              <article className="studio-workflow-card" key={definition.id}>
                <div className="studio-workflow-main">
                  <div className="studio-workflow-heading">
                    <div>
                      <span className={`studio-status studio-status--${definition.status}`}>{statusLabels[definition.status]}</span>
                      <h2>{definition.name}</h2>
                    </div>
                    <code>{definition.slug}</code>
                  </div>
                  <p>{definition.description || "Geen doelbeschrijving ingevuld."}</p>
                  <dl className="studio-workflow-meta">
                    <div><dt>Eigenaar</dt><dd>{definition.ownerUserId === identity.userId ? identity.displayName : definition.ownerUserId}</dd></div>
                    <div><dt>Laatste wijziging</dt><dd>{formatUpdatedAt(definition.updatedAt)}</dd></div>
                    <div><dt>Gepubliceerde versie</dt><dd>{published ? `v${published.versionNumber}` : "—"}</dd></div>
                    <div><dt>Scope</dt><dd>{definition.clientIds?.length ? `${definition.clientIds.length} client(s)` : definition.businessUnit}</dd></div>
                  </dl>
                </div>
                <div className="studio-workflow-actions" aria-label={`Acties voor ${definition.name}`}>
                  {canDesign && draft ? (
                    <Link className="button button-primary" href={`/workflow-studio/${definition.id}/edit`}>Hervatten</Link>
                  ) : null}
                  {canDesign && !draft && published ? (
                    <WorkflowBranchDraftButton definitionId={definition.id} />
                  ) : null}
                  {canDesign && templateReference && definition.status !== "archived" ? (
                    <Link className="button button-secondary" href={`/workflow-studio/new?template=${encodeURIComponent(templateReference)}`}>Klonen</Link>
                  ) : null}
                  {canDeprecate && definition.status !== "deprecated" && definition.status !== "archived" ? (
                    <details className="studio-deprecate">
                      <summary>Uitfaseren</summary>
                      <p>De definitie verdwijnt uit toekomstig gebruik. Gepubliceerde versies blijven intact.</p>
                      <form action={deprecateWorkflowAction}>
                        <input type="hidden" name="definitionId" value={definition.id} />
                        <button className="button button-danger" type="submit">Uitfaseren bevestigen</button>
                      </form>
                    </details>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
