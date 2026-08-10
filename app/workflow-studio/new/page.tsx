import Link from "next/link";
import { redirect } from "next/navigation";
import { getIdentityContext } from "@/lib/identity/request";
import { sql } from "@/lib/db";
import { authorizeWorkflowStudioRoute } from "@/lib/workflow-studio/route-access";
import { createWorkflowDefinitionService } from "@/lib/workflow-studio/definition-service";
import { loadWorkflowOverview } from "@/lib/workflow-studio/overview";
import { WorkflowDraftCreateForm, type WorkflowTemplateOption } from "./workflow-draft-create-form";
import { BUILTIN_WORKFLOW_TEMPLATES } from "@/lib/workflow-studio/builtin-workflow-templates";

type Props = { searchParams?: Promise<{ template?: string }> };

export default async function NewWorkflowPage({ searchParams }: Props) {
  const identity = await getIdentityContext();
  if (!authorizeWorkflowStudioRoute(identity, "/workflow-studio/new").authorized) redirect("/workflow-studio");
  const params = searchParams ? await searchParams : undefined;

  let templates: WorkflowTemplateOption[] = BUILTIN_WORKFLOW_TEMPLATES.map((template) => ({
    reference: `builtin:${template.id}`,
    label: `${template.label} · standaardtemplate`,
    description: template.description,
  }));
  if (sql) {
    const overview = await loadWorkflowOverview(createWorkflowDefinitionService(sql), identity);
    if (overview.ok) {
      templates = [...templates, ...overview.value.flatMap(({ definition, draft, published }) => {
        if (definition.status === "deprecated" || definition.status === "archived") return [];
        const reference = draft
          ? `definition:${definition.id}`
          : published
            ? `version:${published.id}`
            : null;
        return reference ? [{
          reference,
          label: `${definition.name}${published ? ` · v${published.versionNumber}` : " · draft"}`,
          description: definition.description,
        }] : [];
      })];
    }
  }
  const selectedTemplate = templates.some((template) => template.reference === params?.template)
    ? params?.template
    : "";

  return (
    <div className="page-shell studio-create-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">WORKFLOW STUDIO</p>
          <h1>Nieuwe workflow</h1>
          <p>Begin met een minimale geldige flow of maak een onafhankelijke kopie van een bestaande workflow.</p>
        </div>
        <Link className="button button-secondary" href="/workflow-studio">Annuleren</Link>
      </div>
      <WorkflowDraftCreateForm templates={templates} selectedTemplate={selectedTemplate} />
    </div>
  );
}
