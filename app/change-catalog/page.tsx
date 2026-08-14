import Link from "next/link";

import { sql } from "@/lib/db";
import { getIdentityContext } from "@/lib/identity/request";
import { reportUserVisibleIssue } from "@/lib/user-visible-issue";
import { loadPublishedWorkflowCatalog } from "@/lib/workflow-studio/catalog";
import { buildBlockedWorkflowWarning } from "@/lib/workflow-studio/catalog-warning";
import { WorkflowCatalog } from "@/components/workflow-catalog";

export default async function ChangeCatalogPage() {
  const identity = await getIdentityContext();
  const workflows = sql ? await loadPublishedWorkflowCatalog(sql, identity) : [];
  const warning = buildBlockedWorkflowWarning(workflows);

  if (warning) {
    await reportUserVisibleIssue({
      route: "/change-catalog",
      severity: "warning",
      message: warning.summary,
      fingerprint: "change-catalog:published-workflows-not-startable",
      details: {
        blockedCount: warning.blockedWorkflows.length,
        totalWorkflows: workflows.length,
        workflowRuntimeStartEnabled: process.env.BCM_FEATURE_WORKFLOW_RUNTIME_START ?? null,
        identityGroups: identity.groups.slice(0, 10),
        identityTenant: identity.tenant ?? null,
        identityBusinessUnit: identity.businessUnit ?? null,
        blockedWorkflows: warning.blockedWorkflows.map(
          (item) => `${item.slug}@v${item.versionNumber}: ${item.reason}`,
        ),
      },
    });
  }

  return (
    <div className="page-shell config-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">CHANGE CATALOGUS</p>
          <h1>Change catalogus</h1>
          <p>
            Kies een gepubliceerde workflow uit de Workflow Studio. Proces,
            formulier, kosten en static data komen uit de gepubliceerde versie.
          </p>
        </div>
        <div className="standard-note">
          <b>Workflow Studio leidend</b>
          <span>Gepubliceerd · Versiebevroren · Runtime startbaar</span>
        </div>
      </div>

      <WorkflowCatalog items={workflows} />

      {warning ? (
        <div className="form-errors" role="status">
          <p>{warning.summary}</p>
          <details className="blocked-workflow-details">
            <summary>{warning.blockedWorkflows.length === 1 ? "Geblokkeerde workflow" : "Geblokkeerde workflows"}</summary>
            <ul>
              {warning.blockedWorkflows.map((item) => (
                <li key={`${item.slug}@v${item.versionNumber}`}>
                  <b>{item.name}</b> (v{item.versionNumber}): {item.reason}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}

      {workflows.length === 0 ? (
        <section className="cost-summary">
          <p className="eyebrow">GEEN PUBLICATIES</p>
          <h2>Publiceer eerst een workflow</h2>
          <p>
            Maak of onderhoud changeprocessen in de Workflow Studio en publiceer
            een goedgekeurde versie voordat change managers ze kunnen aanvragen.
          </p>
          <Link className="button button-primary" href="/workflow-studio">
            Naar Workflow Studio
          </Link>
        </section>
      ) : (
        <section className="cost-summary">
          <p className="eyebrow">HOE WERKT HET</p>
          <h2>Een change aanvragen</h2>
          <div className="cost-grid">
            <article className="cost-card">
              <p className="cost-card-type">1. Kies een workflow</p>
              <p className="cost-card-detail">Selecteer een gepubliceerde change workflow.</p>
            </article>
            <article className="cost-card">
              <p className="cost-card-type">2. Vul het formulier in</p>
              <p className="cost-card-detail">De velden komen uit de gepubliceerde Studio-versie.</p>
            </article>
            <article className="cost-card">
              <p className="cost-card-type">3. Start de runtime</p>
              <p className="cost-card-detail">De aanvraag krijgt een onveranderlijke workflowversie.</p>
            </article>
          </div>
        </section>
      )}
    </div>
  );
}
