import { getChangeTypes, sql } from "@/lib/db";
import {
  sortChangeTypes,
  getActiveChangeTypes,
} from "@/lib/change-type-catalog";
import { ChangeTypeCatalog } from "@/components/change-type-catalog";
import { getIdentityContext } from "@/lib/identity/request";
import { createWorkflowDefinitionService } from "@/lib/workflow-studio/definition-service";
import { loadWorkflowOverview } from "@/lib/workflow-studio/overview";

export default async function ChangeCatalogPage() {
  const changeTypes = sortChangeTypes(
    getActiveChangeTypes(await getChangeTypes())
  );
  const identity = await getIdentityContext();
  const workflowOverview = sql
    ? await loadWorkflowOverview(createWorkflowDefinitionService(sql), identity)
    : null;
  const publishedWorkflows = workflowOverview?.ok
    ? workflowOverview.value.filter((item) => item.definition.status === "published" && item.published)
    : [];

  return (
    <div className="page-shell config-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">CHANGE CATALOGUS</p>
          <h1>Change catalogus</h1>
          <p>
            Bekijk alle beschikbare change types met kosten, doorlooptijd en
            processtappen. Kies het type dat bij jouw wijziging past.
          </p>
        </div>
        <div className="standard-note">
          <b>Overzicht</b>
          <span>Categorie · Kosten · Doorlooptijd · Procesflow</span>
        </div>
      </div>

      <ChangeTypeCatalog types={changeTypes} />

      {publishedWorkflows.length > 0 && <section className="catalog-section" aria-labelledby="published-workflows-title">
        <div>
          <p className="eyebrow">WORKFLOW STUDIO</p>
          <h2 id="published-workflows-title">Nieuwe workflowtemplates</h2>
          <p>Gevalideerde, gereviewde en onveranderbaar gepubliceerde processen binnen jouw scope.</p>
        </div>
        <div className="catalog-list">
          {publishedWorkflows.map(({ definition, published }) => <article key={definition.id}>
            <b>{definition.name}</b>
            <span>{definition.catalogDescription || definition.description}</span>
            <small>{definition.category ?? "other"} · v{published?.versionNumber} · {definition.costModel?.currency ?? "EUR"} {definition.costModel?.baseCost ?? 0}</small>
            {published?.contentHash && <code title={published.contentHash}>sha256:{published.contentHash.slice(0, 12)}…</code>}
          </article>)}
        </div>
      </section>}

      <section className="cost-summary">
        <p className="eyebrow">HOE WERKT HET</p>
        <h2>Een change aanvragen</h2>
        <div className="cost-grid">
          <article className="cost-card">
            <p className="cost-card-type">1. Kies een type</p>
            <p className="cost-card-detail">
              Selecteer het change type dat past bij je wijziging
            </p>
          </article>
          <article className="cost-card">
            <p className="cost-card-type">2. Vul gegevens in</p>
            <p className="cost-card-detail">
              Doorloop het formulier met de specifieke velden voor dit type
            </p>
          </article>
          <article className="cost-card">
            <p className="cost-card-type">3. Verzenden</p>
            <p className="cost-card-detail">
              Dien de change in voor verwerking; je ontvangt een bevestiging
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
