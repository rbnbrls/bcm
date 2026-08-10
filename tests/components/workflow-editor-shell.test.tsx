// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { BlockCatalogEntry } from "@/lib/workflow-studio/block-registry";
import type { BlockConfigurationUiSchema } from "@/lib/workflow-studio/block-contract";
import type { WorkflowEditorEdge, WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";
import { WorkflowEditorShell } from "@/app/workflow-studio/[definitionId]/edit/workflow-editor-shell";

function catalogEntry(blockType: string, label: string, order: number): BlockCatalogEntry {
  const inputs = blockType === "manual_start" ? [] : [{ id: "in", label: "In", valueType: "flow" as const, required: true, maxConnections: 1 }];
  const outputs = blockType === "end" ? [] : [{ id: "out", label: "Uit", valueType: "flow" as const, required: true, maxConnections: 1 }];
  const configurationSchema = blockType === "manual_start" ? {
    type: "object",
    properties: {
      label: { type: "string", minLength: 1, default: "Handmatige start" },
      starterRoleIds: { type: "array", minItems: 1, items: { type: "string" }, default: ["aanvrager"] },
      dataScope: { type: "string", enum: ["workflow_default", "requester_scope"], default: "workflow_default" },
    },
    required: ["label"],
    additionalProperties: false,
  } : blockType === "end" ? {
    type: "object",
    properties: {
      label: { type: "string", minLength: 1, default: "Einde" },
      outcome: { type: "string", enum: ["completed", "rejected", "cancelled"], default: "completed" },
    },
    additionalProperties: false,
  } : {};
  const configurationUiSchema: BlockConfigurationUiSchema = blockType === "manual_start" ? {
    fieldOrder: ["label", "starterRoleIds", "dataScope"],
    widgets: { label: "text", starterRoleIds: "workflow-role-multiselect", dataScope: "select" },
    labels: { label: "Label", starterRoleIds: "Starterrollen", dataScope: "Datascope" },
  } : blockType === "end" ? {
    fieldOrder: ["label", "outcome"],
    widgets: { label: "text", outcome: "select" },
    labels: { label: "Label", outcome: "Uitkomst" },
  } : { fieldOrder: [], widgets: {} };
  return {
    blockType,
    contractVersion: 1,
    configurationSchema,
    configurationUiSchema,
    inputs,
    outputs,
    capabilities: [],
    ui: { label, description: `${label} beschrijving`, category: "control", icon: "block", order },
  };
}

const catalog = [
  catalogEntry("manual_start", "Handmatige start", 10),
  catalogEntry("end", "Einde", 20),
  catalogEntry("form", "Formulier", 30),
  catalogEntry("role_task", "Roltaak", 40),
  catalogEntry("approval", "Goedkeuring", 50),
  catalogEntry("client_config_lookup", "Client-config opzoeken", 60),
  catalogEntry("change_request", "Wijzigingsverzoek", 70),
  catalogEntry("decision", "Beslissing", 80),
  catalogEntry("notification", "Notificatie", 90),
];

const initialNodes: WorkflowEditorNode[] = [
  {
    id: "start-id",
    nodeKey: "start",
    blockType: "manual_start",
    contractVersion: 1,
    label: "Start",
    description: "Start",
    configuration: { label: "Start" },
    position: { x: 40, y: 80 },
  },
  {
    id: "end-id",
    nodeKey: "end",
    blockType: "end",
    contractVersion: 1,
    label: "Voltooid",
    description: "Einde",
    configuration: { label: "Voltooid", outcome: "completed" },
    position: { x: 300, y: 80 },
  },
];

const initialEdges: WorkflowEditorEdge[] = [
  { id: "edge-id", edgeKey: "start_to_end", sourceNodeId: "start-id", sourcePort: "out", targetNodeId: "end-id", targetPort: "in" },
];

function renderEditor() {
  return render(
    <WorkflowEditorShell
      workflowName="Testworkflow"
      revision="3"
      initialMetadata={{
        definitionId: "11111111-1111-4111-8111-111111111111",
        name: "Testworkflow",
        slug: "testworkflow",
        description: "Een duidelijk doel voor de testworkflow.",
        category: "change",
        tags: ["test"],
        catalogDescription: "Een heldere beschrijving voor de workflowcatalogus.",
        costModel: { baseCost: 25, currency: "EUR", description: "Vaste kosten" },
        ownerUserId: "test-user",
        scope: { tenant: "test", businessUnit: "it", clientIds: null },
      }}
      dataCatalog={[
        {
          id: "client",
          label: "Client",
          description: "Testclients",
          authorizationScope: "client",
          identityAttributeId: "code",
          attributes: [
            { id: "code", label: "Clientcode", description: "Code", valueType: "string", authorizationScope: "client" },
            { id: "name", label: "Clientnaam", description: "Naam", valueType: "string", authorizationScope: "client" },
          ],
        },
        {
          id: "portfolio_configuration",
          label: "Portfolioconfiguratie",
          description: "Testconfiguraties",
          authorizationScope: "client",
          identityAttributeId: "primary_account_id",
          attributes: [
            { id: "primary_account_id", label: "Primary account", description: "ID", valueType: "string", authorizationScope: "client" },
            { id: "client_code", label: "Client", description: "Client", valueType: "reference", authorizationScope: "client", relationship: { resourceId: "client", attributeId: "code", cardinality: "many_to_one" } },
            { id: "active", label: "Actief", description: "Status", valueType: "boolean", authorizationScope: "client" },
            { id: "effective_from", label: "Geldig vanaf", description: "Datum", valueType: "date", authorizationScope: "client" },
          ],
        },
      ]}
      changeRequestCatalog={[
        {
          id: "portfolio_configuration",
          label: "Portfolioconfiguratie",
          description: "Aanvraagbare testconfiguraties",
          authorizationScope: "client",
          identityAttributeId: "primary_account_id",
          attributes: [
            { id: "primary_account_id", label: "Primary account", description: "ID", valueType: "string", authorizationScope: "client", requestableOperations: ["RETIRE"] },
            { id: "portfolio_code", label: "Portfolio", description: "Portfolio", valueType: "reference", authorizationScope: "client", requestableOperations: ["CREATE", "UPDATE"] },
            { id: "benchmark_code", label: "Benchmark", description: "Benchmark", valueType: "reference", authorizationScope: "client", requestableOperations: ["CREATE", "UPDATE"] },
            { id: "effective_until", label: "Geldig tot", description: "Einddatum", valueType: "date", authorizationScope: "client", requestableOperations: ["UPDATE", "RETIRE"] },
          ],
        },
      ]}
      catalog={catalog}
      initialNodes={initialNodes}
      initialEdges={initialEdges}
    />,
  );
}

describe("WorkflowEditorShell", () => {
  it("renders palette, canvas, properties, outline and validation landmarks", () => {
    renderEditor();
    expect(screen.getByRole("heading", { name: "Blokkenpalet" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Canvas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Properties" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Outline" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Validatie" })).toBeInTheDocument();
    expect(screen.getByRole("tree", { name: "Workflowstructuur" })).toBeInTheDocument();
  });

  it("validates required metadata inline and updates the catalog preview", () => {
    renderEditor();
    const preview = screen.getByText("CATALOGUSPREVIEW").closest("article");
    if (!preview) throw new Error("Cataloguspreview ontbreekt");
    expect(screen.getAllByRole("heading", { name: "Testworkflow" })).toHaveLength(2);
    expect(within(preview).getByText("Een heldere beschrijving voor de workflowcatalogus.")).toBeInTheDocument();
    expect(within(preview).getByText("EUR 25.00")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Naam *" }), { target: { value: "" } });
    expect(screen.getByText(/Naam is verplicht/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Metadata opslaan" })).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Naam *" }), { target: { value: "Nieuwe workflow" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Catalogusbeschrijving *" }), { target: { value: "Nieuwe catalogustekst die direct zichtbaar is." } });
    expect(screen.getByRole("heading", { name: "Nieuwe workflow" })).toBeInTheDocument();
    expect(within(preview).getByText("Nieuwe catalogustekst die direct zichtbaar is.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Metadata opslaan" })).toBeEnabled();
  });

  it("updates the read-only end-user preview directly from local draft changes", () => {
    renderEditor();
    const livePreview = screen.getByText("DRAFTPREVIEW · ALLEEN-LEZEN").closest("div[data-preview-mode]");
    if (!(livePreview instanceof HTMLElement)) throw new Error("Live preview ontbreekt");
    expect(within(livePreview).getByText(/uitsluitend de actuele lokale draft/)).toBeInTheDocument();
    expect(within(livePreview).queryByRole("button")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Basiskosten *" }), { target: { value: "40" } });
    expect(within(livePreview).getByText(/40,00/)).toBeInTheDocument();

    const palette = screen.getByRole("heading", { name: "Blokkenpalet" }).parentElement;
    if (!palette) throw new Error("Palette ontbreekt");
    fireEvent.click(within(palette).getByRole("button", { name: /Formulier/ }));
    const builder = screen.getByRole("heading", { name: "Formulier bouwen" }).parentElement;
    if (!builder) throw new Error("Form builder ontbreekt");
    fireEvent.change(within(builder).getByRole("textbox", { name: "Titel" }), { target: { value: "Actuele draftaanvraag" } });

    expect(within(livePreview).getByRole("heading", { name: "Actuele draftaanvraag" })).toBeInTheDocument();
    expect(within(livePreview).getByText("3")).toBeInTheDocument();
  });

  it("simulates the current draft locally and shows path and audit events", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Simulatie uitvoeren" }));
    expect(screen.getByText("Pad voltooid")).toBeInTheDocument();
    const result = screen.getByRole("heading", { name: "Simulatieresultaat" }).parentElement;
    if (!result) throw new Error("Simulatieresultaat ontbreekt");
    expect(within(result).getByText("start")).toBeInTheDocument();
    expect(within(result).getByText("end")).toBeInTheDocument();
    expect(within(result).getByText(/simulation.started/)).toBeInTheDocument();
    expect(within(result).getByText(/workflow.completed/)).toBeInTheDocument();
    expect(within(result).getByText("Geen intents gepland.")).toBeInTheDocument();

    const palette = screen.getByRole("heading", { name: "Blokkenpalet" }).parentElement;
    if (!palette) throw new Error("Palette ontbreekt");
    fireEvent.click(within(palette).getByRole("button", { name: /Formulier/ }));
    expect(screen.queryByText("Pad voltooid")).not.toBeInTheDocument();
    expect(screen.getByText("Kies fixtures en voer de simulatie uit.")).toBeInTheDocument();
  });

  it("adds a block through the keyboard-accessible palette button", () => {
    renderEditor();
    const palette = screen.getByRole("heading", { name: "Blokkenpalet" }).parentElement;
    if (!palette) throw new Error("Palette ontbreekt");
    fireEvent.click(within(palette).getByRole("button", { name: /Formulier/ }));

    expect(screen.getAllByText("form_1")).toHaveLength(3);
    expect(screen.getByRole("button", { name: /Formulier, x/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Lokale wijzigingen")).toBeInTheDocument();
  });

  it("configures starter roles, start scope and explicit end outcomes with undo support", () => {
    renderEditor();
    fireEvent.change(screen.getByRole("textbox", { name: "Starterrollen" }), { target: { value: "aanvrager, change_manager" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Datascope" }), { target: { value: "requester_scope" } });
    expect(screen.getByRole("combobox", { name: "Datascope" })).toHaveValue("requester_scope");

    fireEvent.click(within(screen.getByRole("tree", { name: "Workflowstructuur" })).getByRole("button", { name: /Voltooid/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Uitkomst" }), { target: { value: "rejected" } });
    expect(screen.getByRole("combobox", { name: "Uitkomst" })).toHaveValue("rejected");

    fireEvent.click(screen.getByRole("button", { name: "Ongedaan maken" }));
    expect(screen.getByRole("combobox", { name: "Uitkomst" })).toHaveValue("completed");
  });

  it("builds all eight form field types from the shared form contract", () => {
    renderEditor();
    const palette = screen.getByRole("heading", { name: "Blokkenpalet" }).parentElement;
    if (!palette) throw new Error("Palette ontbreekt");
    fireEvent.click(within(palette).getByRole("button", { name: /Formulier/ }));

    const builder = screen.getByRole("heading", { name: "Formulier bouwen" }).parentElement;
    if (!builder) throw new Error("Form builder ontbreekt");
    const typeSelect = within(builder).getByRole("combobox", { name: "Nieuw veldtype" });
    for (const type of ["text", "longtext", "number", "currency", "date", "boolean", "select", "multiselect"]) {
      fireEvent.change(typeSelect, { target: { value: type } });
      fireEvent.click(within(builder).getByRole("button", { name: "Veld toevoegen" }));
    }

    const fieldGroups = within(builder).getAllByRole("group");
    expect(fieldGroups).toHaveLength(8);
    fireEvent.change(within(fieldGroups[0]!).getByRole("combobox", { name: "Type" }), { target: { value: "currency" } });
    expect(within(builder).getByText("Formuliercontract geldig")).toBeInTheDocument();
    expect(within(builder).getByRole("heading", { name: "Formuliervoorbeeld" })).toBeInTheDocument();
    expect(screen.getByText("Lokale wijzigingen")).toBeInTheDocument();
  });

  it("configures role-task IO/deadline and approval decisions/comments", () => {
    renderEditor();
    const palette = screen.getByRole("heading", { name: "Blokkenpalet" }).parentElement;
    if (!palette) throw new Error("Palette ontbreekt");
    fireEvent.click(within(palette).getByRole("button", { name: /Roltaak/ }));

    const task = screen.getByRole("group", { name: "Roltaak configureren" });
    fireEvent.change(within(task).getByRole("textbox", { name: "Uitvoerdersrol" }), { target: { value: "operations" } });
    fireEvent.change(within(task).getByRole("textbox", { name: "Invoervariabelen" }), { target: { value: "aanvraag, toelichting" } });
    fireEvent.change(within(task).getByRole("textbox", { name: "Uitvoervariabelen" }), { target: { value: "resultaat" } });
    fireEvent.change(within(task).getByRole("spinbutton", { name: "Deadline in uren" }), { target: { value: "48" } });
    expect(within(task).getByText("aanvraag, toelichting")).toBeInTheDocument();
    expect(within(task).getByText("resultaat")).toBeInTheDocument();

    fireEvent.click(within(palette).getByRole("button", { name: /Goedkeuring/ }));
    const approval = screen.getByRole("group", { name: "Goedkeuring configureren" });
    fireEvent.change(within(approval).getByRole("textbox", { name: "Goedkeurdersrol" }), { target: { value: "checker" } });
    fireEvent.change(within(approval).getByRole("textbox", { name: "Afwijzen" }), { target: { value: "Niet akkoord" } });
    expect(within(approval).getByRole("button", { name: "Niet akkoord" })).toBeInTheDocument();
    expect(within(approval).getAllByRole("checkbox", { name: "Opmerking verplicht" })).toHaveLength(3);
    expect(screen.getByText("Lokale wijzigingen")).toBeInTheDocument();
  });

  it("offers typed outputs from other blocks through the shared data-mapping picker", () => {
    renderEditor();
    const palette = screen.getByRole("heading", { name: "Blokkenpalet" }).parentElement;
    if (!palette) throw new Error("Palette ontbreekt");
    fireEvent.click(within(palette).getByRole("button", { name: /Formulier/ }));
    fireEvent.click(screen.getByRole("button", { name: "Veld toevoegen" }));
    fireEvent.click(within(palette).getByRole("button", { name: /Roltaak/ }));

    const task = screen.getByRole("group", { name: "Roltaak configureren" });
    const picker = within(task).getByRole("combobox", { name: "Invoervariabelen kiezen" });
    expect(within(picker).getByRole("option", { name: /text_1.*form_1.*text/ })).toBeInTheDocument();
    fireEvent.change(picker, { target: { value: "text_1" } });
    expect(within(task).getByRole("textbox", { name: "Invoervariabelen" })).toHaveValue("text_1");
  });

  it("configures dependent catalog lookups and previews only masked typed data", () => {
    renderEditor();
    const palette = screen.getByRole("heading", { name: "Blokkenpalet" }).parentElement;
    if (!palette) throw new Error("Palette ontbreekt");
    fireEvent.click(within(palette).getByRole("button", { name: /Client-config opzoeken/ }));

    const lookup = screen.getByRole("group", { name: "Client-config lookup configureren" });
    fireEvent.change(within(lookup).getByRole("combobox", { name: "Resource" }), { target: { value: "portfolio_configuration" } });
    fireEvent.change(within(lookup).getByRole("combobox", { name: "Parent-binding" }), { target: { value: "attribute" } });
    fireEvent.change(within(lookup).getByRole("textbox", { name: "Parent-outputvariabele" }), { target: { value: "geselecteerde_portfolio" } });
    fireEvent.change(within(lookup).getByRole("combobox", { name: "Doelattribuut" }), { target: { value: "client_code" } });
    fireEvent.change(within(lookup).getByRole("combobox", { name: "Selectiegedrag" }), { target: { value: "many" } });
    fireEvent.change(within(lookup).getByRole("textbox", { name: "Outputvariabele" }), { target: { value: "configuratieregels" } });

    expect(within(lookup).getByText("Lookupcontract geldig")).toBeInTheDocument();
    expect(within(lookup).getByText("Geen productiegegevens · waarden zijn gemaskeerd")).toBeInTheDocument();
    expect(within(lookup).getByText("configuratieregels: array<object>")).toBeInTheDocument();
    expect(within(lookup).getAllByText(/\*\*\*/).length).toBeGreaterThan(0);
  });

  it("maps requestable attributes from snapshot IST to workflow-output SOLL", () => {
    renderEditor();
    const palette = screen.getByRole("heading", { name: "Blokkenpalet" }).parentElement;
    if (!palette) throw new Error("Palette ontbreekt");
    fireEvent.click(within(palette).getByRole("button", { name: /Wijzigingsverzoek/ }));

    const builder = screen.getByRole("group", { name: "Wijzigingsverzoek configureren" });
    expect(within(builder).queryByRole("option", { name: /Actief/ })).not.toBeInTheDocument();
    fireEvent.change(within(builder).getByRole("combobox", { name: "Doelattribuut" }), { target: { value: "benchmark_code" } });
    fireEvent.change(within(builder).getByRole("textbox", { name: "IST-snapshotvariabele" }), { target: { value: "configuratie_snapshot" } });
    fireEvent.change(within(builder).getByRole("textbox", { name: "SOLL-variabele" }), { target: { value: "formulier_benchmark" } });
    fireEvent.change(within(builder).getByRole("textbox", { name: "Ingangsdatumvariabele" }), { target: { value: "gewenste_ingangsdatum" } });
    fireEvent.change(within(builder).getByRole("textbox", { name: "Redenvariabele" }), { target: { value: "wijzigingsreden" } });

    expect(within(builder).getByText("Wijzigingscontract geldig")).toBeInTheDocument();
    expect(within(builder).getByText(/IST configuratie_snapshot\.benchmark_code/)).toBeInTheDocument();
    expect(within(builder).getByText(/SOLL formulier_benchmark/)).toBeInTheDocument();
    expect(within(builder).getByText("gewenste_ingangsdatum: date")).toBeInTheDocument();
    expect(within(builder).getByText("wijzigingsreden: string")).toBeInTheDocument();
  });

  it("builds and explains typed decision rules with example values", () => {
    renderEditor();
    const palette = screen.getByRole("heading", { name: "Blokkenpalet" }).parentElement;
    if (!palette) throw new Error("Palette ontbreekt");
    fireEvent.click(within(palette).getByRole("button", { name: /Beslissing/ }));

    const builder = screen.getByRole("group", { name: "Beslissing configureren" });
    fireEvent.change(within(builder).getByRole("textbox", { name: "Variabele" }), { target: { value: "bedrag" } });
    fireEvent.change(within(builder).getByRole("combobox", { name: "Type" }), { target: { value: "number" } });
    fireEvent.change(within(builder).getByRole("combobox", { name: "Operator" }), { target: { value: "greater_than" } });
    fireEvent.change(within(builder).getByRole("spinbutton", { name: "Waarde" }), { target: { value: "100" } });

    const preview = within(builder).getByRole("heading", { name: "Test met voorbeeldwaarden" }).parentElement;
    if (!preview) throw new Error("Beslispreview ontbreekt");
    fireEvent.change(within(preview).getByRole("spinbutton", { name: /bedrag/ }), { target: { value: "150" } });
    expect(within(builder).getByText("Besliscontract geldig")).toBeInTheDocument();
    expect(within(preview).getByText("Uitkomst: waar")).toBeInTheDocument();
    expect(within(preview).getByText(/bedrag \(number\) greater_than 100 → waar/)).toBeInTheDocument();
    expect(within(preview).getByText("matched")).toBeInTheDocument();

    fireEvent.click(within(builder).getByRole("button", { name: "Groep toevoegen" }));
    expect(within(builder).getAllByRole("group", { name: "Regelgroep" })).toHaveLength(2);
    expect(within(builder).getAllByRole("combobox", { name: "Combinatie" })).toHaveLength(2);
  });

  it("configures role notifications and previews escaped template output", () => {
    renderEditor();
    const palette = screen.getByRole("heading", { name: "Blokkenpalet" }).parentElement;
    if (!palette) throw new Error("Palette ontbreekt");
    fireEvent.click(within(palette).getByRole("button", { name: /Notificatie/ }));

    const builder = screen.getByRole("group", { name: "Notificatie configureren" });
    fireEvent.change(within(builder).getByRole("textbox", { name: "Ontvangersrollen" }), { target: { value: "aanvrager, operations" } });
    fireEvent.change(within(builder).getByRole("combobox", { name: "Kanaal" }), { target: { value: "email" } });
    fireEvent.change(within(builder).getByRole("combobox", { name: "Triggerpunt" }), { target: { value: "on_workflow_completed" } });
    fireEvent.change(within(builder).getByRole("textbox", { name: "Templatevariabelen" }), { target: { value: "aanvraagnummer" } });
    fireEvent.change(within(builder).getByRole("textbox", { name: "Onderwerptemplate" }), { target: { value: "Aanvraag {{ aanvraagnummer }}" } });
    fireEvent.change(within(builder).getByRole("textbox", { name: "Berichttemplate" }), { target: { value: "Resultaat voor {{ aanvraagnummer }}" } });

    const preview = within(builder).getByRole("heading", { name: "Veilige templatepreview" }).parentElement;
    if (!preview) throw new Error("Notificatiepreview ontbreekt");
    fireEvent.change(within(preview).getByRole("textbox", { name: "aanvraagnummer" }), { target: { value: '<script>alert("x")</script>' } });
    expect(within(builder).getByText("Notificatiecontract geldig")).toBeInTheDocument();
    expect(within(preview).getByText(/Aanvraag &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/)).toBeInTheDocument();
    expect(within(preview).queryByText("alert(\"x\")", { selector: "script" })).not.toBeInTheDocument();
    expect(within(builder).queryByRole("textbox", { name: /webhook/i })).not.toBeInTheDocument();
  });

  it("selects and moves a canvas block with only the keyboard", () => {
    renderEditor();
    const start = screen.getByRole("button", { name: "Start, x 40, y 80" });
    start.focus();
    fireEvent.keyDown(start, { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Start, x 56, y 80" }), { key: "ArrowDown", shiftKey: true });

    expect(screen.getByRole("button", { name: "Start, x 56, y 128" })).toBeInTheDocument();
    expect(screen.getByText("x 56, y 128")).toBeInTheDocument();
  });

  it("removes the focused block with Delete and reports the validation error", () => {
    renderEditor();
    const start = screen.getByRole("button", { name: "Start, x 40, y 80" });
    fireEvent.keyDown(start, { key: "Delete" });

    expect(screen.queryByRole("button", { name: /Start, x/ })).not.toBeInTheDocument();
    expect(screen.getByText(/precies één startblok; gevonden: 0/)).toBeInTheDocument();
  });

  it("adds a missing end node through a safe validation quick fix", () => {
    renderEditor();
    const outline = screen.getByRole("tree", { name: "Workflowstructuur" });
    fireEvent.click(within(outline).getByRole("button", { name: /Voltooid/ }));
    fireEvent.click(screen.getByRole("button", { name: "Blok verwijderen" }));

    expect(screen.getByText("Publicatie geblokkeerd")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quick fix toepassen" }));
    expect(screen.getByRole("button", { name: /Einde, x/ })).toBeInTheDocument();
    expect(screen.getByText(/Start:out → Einde:in/)).toBeInTheDocument();
    expect(screen.getByText("Klaar voor review")).toBeInTheDocument();
  });

  it("navigates contract blockers to their node and property", () => {
    renderEditor();
    fireEvent.change(screen.getByRole("textbox", { name: "Label *" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Start: Gebruik minimaal 1 teken/ }));
    expect(screen.getByText("Eigenschap:").parentElement).toHaveTextContent("label");
    expect(screen.getByRole("button", { name: /Start, x/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("requires explicit acknowledgement when only warnings remain", () => {
    renderEditor();
    const palette = screen.getByRole("heading", { name: "Blokkenpalet" }).parentElement;
    if (!palette) throw new Error("Palette ontbreekt");
    fireEvent.click(within(palette).getByRole("button", { name: /^Einde/ }));

    expect(screen.getByText("Bevestiging vereist")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Ik heb alle actuele waarschuwingen beoordeeld." }));
    expect(screen.getByText("Klaar voor review")).toBeInTheDocument();
  });

  it("selects a node from the outline without using the canvas", () => {
    renderEditor();
    const outline = screen.getByRole("tree", { name: "Workflowstructuur" });
    fireEvent.click(within(outline).getByRole("button", { name: /Voltooid/ }));
    expect(screen.getByRole("button", { name: "Voltooid, x 300, y 80" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("end@1")).toBeInTheDocument();
  });

  it("supports dragging a palette block onto a canvas position", () => {
    renderEditor();
    const data = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? "",
    };
    const palette = screen.getByRole("heading", { name: "Blokkenpalet" }).parentElement;
    if (!palette) throw new Error("Palette ontbreekt");
    fireEvent.dragStart(within(palette).getByRole("button", { name: /Formulier/ }), { dataTransfer });
    const canvas = screen.getByRole("heading", { name: "Canvas" }).parentElement?.nextElementSibling;
    if (!canvas) throw new Error("Canvas ontbreekt");
    fireEvent.drop(canvas, { dataTransfer, clientX: 260, clientY: 220 });

    expect(screen.getByRole("button", { name: /Formulier, x \d+, y \d+/ })).toBeInTheDocument();
  });

  it("removes an edge and restores it with undo/redo", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Verwijder verbinding Start:out/ }));
    expect(screen.getByText("Nog geen verbindingen.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ongedaan maken" }));
    expect(screen.getByText("Start:out → Voltooid:in")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw uitvoeren" }));
    expect(screen.getByText("Nog geen verbindingen.")).toBeInTheDocument();
  });

  it("shows compatible target ports and connects nodes with port buttons", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Verwijder verbinding Start:out/ }));
    const palette = screen.getByRole("heading", { name: "Blokkenpalet" }).parentElement;
    if (!palette) throw new Error("Palette ontbreekt");
    fireEvent.click(within(palette).getByRole("button", { name: /Formulier/ }));

    fireEvent.click(screen.getByRole("button", { name: "Uitgang Uit van Start" }));
    const formInput = screen.getByRole("button", { name: "Ingang In van Formulier" });
    expect(formInput).toHaveClass("is-compatible");
    fireEvent.click(formInput);

    expect(screen.getByText("Start:out → Formulier:in")).toBeInTheDocument();
  });

  it("zooms, fits and auto-lays out through accessible toolbar controls", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Uitzoomen" }));
    expect(screen.getByRole("status", { name: "Zoomniveau" })).toHaveTextContent("90%");
    fireEvent.click(screen.getByRole("button", { name: "Passend" }));
    expect(screen.getByRole("status", { name: "Zoomniveau" }).textContent).toMatch(/^\d+%$/);
    fireEvent.click(screen.getByRole("button", { name: "Auto-layout" }));
    expect(screen.getByRole("button", { name: "Ongedaan maken" })).toBeEnabled();
  });
});
