"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { updateChangeTypeActiveAdmin, updateChangeTypeAdmin, type ChangeTypeAdminState } from "./actions";
import type { ChangeTypeConfig } from "@/lib/types";
import {
  formatCategoryLabel,
  formatCurrency,
  formatLeadDays,
} from "@/lib/change-type-catalog";

type Props = {
  changeTypes: ChangeTypeConfig[];
};

const initialState: ChangeTypeAdminState = {};

export function ChangeTypeAdminTable({ changeTypes }: Props) {
  return (
    <div className="config-table-wrap" style={{ marginTop: 24 }}>
      <table className="config-table">
        <thead>
          <tr>
            <th>Naam</th>
            <th>Status</th>
            <th>Kosten</th>
            <th>Per item</th>
            <th>Valuta</th>
            <th>Kostentekst</th>
            <th>Doorlooptijd</th>
            <th>Velden</th>
            <th>Stakeholders</th>
            <th>Volgorde</th>
            <th>Actie</th>
          </tr>
        </thead>
        <tbody>
          {changeTypes.map((changeType) => (
            <ChangeTypeAdminRow key={changeType.id} changeType={changeType} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChangeTypeAdminRow({ changeType }: { changeType: ChangeTypeConfig }) {
  const [state, formAction, pending] = useActionState(updateChangeTypeAdmin, initialState);
  const formId = `change-type-admin-${changeType.id}`;

  return (
    <tr>
      <td>
        <form action={formAction} id={formId} />
        <input type="hidden" name="id" value={changeType.id} form={formId} />
        <input type="hidden" name="slug" value={changeType.slug} form={formId} />
        <input type="hidden" name="active" value={changeType.active ? "true" : "false"} form={formId} />
        <Link href={`/admin/change-types/${changeType.id}`} style={{ textDecoration: "none" }}>
          <b>{changeType.name}</b>
          <small>{changeType.slug} · {formatCategoryLabel(changeType.category)}</small>
        </Link>
      </td>
      <td>
        <ChangeTypeActiveToggle
          id={changeType.id}
          slug={changeType.slug}
          name={changeType.name}
          active={changeType.active}
        />
      </td>
      <td>
        <input
          form={formId}
          name="baseCost"
          type="number"
          min="0"
          step="0.01"
          defaultValue={changeType.cost.baseCost}
          aria-label={`Basiskosten voor ${changeType.name}`}
          style={{ width: 96 }}
        />
        <small>{formatCurrency(changeType.cost.baseCost, changeType.cost.costCurrency)}</small>
      </td>
      <td>
        <input
          form={formId}
          name="perItemCost"
          type="number"
          min="0"
          step="0.01"
          defaultValue={changeType.cost.perItemCost ?? ""}
          placeholder="Geen"
          aria-label={`Kosten per item voor ${changeType.name}`}
          style={{ width: 88 }}
        />
      </td>
      <td>
        <input
          form={formId}
          name="costCurrency"
          maxLength={3}
          defaultValue={changeType.cost.costCurrency}
          aria-label={`Valuta voor ${changeType.name}`}
          style={{ width: 64, textTransform: "uppercase" }}
        />
      </td>
      <td>
        <input
          form={formId}
          name="costDescription"
          maxLength={200}
          defaultValue={changeType.cost.description}
          aria-label={`Kostentekst voor ${changeType.name}`}
          style={{ minWidth: 220 }}
        />
        {state.issues && (
          <small style={{ color: "var(--danger)" }}>{state.issues.join(" ")}</small>
        )}
        {state.message && (
          <small style={{ color: "var(--accent-deep)" }}>{state.message}</small>
        )}
      </td>
      <td>
        <input
          form={formId}
          name="defaultLeadDays"
          type="number"
          min="0"
          max="365"
          step="1"
          defaultValue={changeType.defaultLeadDays}
          aria-label={`Doorlooptijd voor ${changeType.name}`}
          style={{ width: 72 }}
        />
        <small>{formatLeadDays(changeType.defaultLeadDays)}</small>
      </td>
      <td><span style={{ fontSize: 13 }}>{changeType.fields.length} veld{changeType.fields.length !== 1 ? "en" : ""}</span></td>
      <td><span style={{ fontSize: 13 }}>{changeType.stakeholders.length}</span></td>
      <td>
        <input
          form={formId}
          name="sortOrder"
          type="number"
          min="0"
          step="1"
          defaultValue={changeType.sortOrder}
          aria-label={`Volgorde voor ${changeType.name}`}
          style={{ width: 64 }}
        />
      </td>
      <td>
        <button
          form={formId}
          name="id"
          value={changeType.id}
          className="button button-secondary"
          disabled={pending}
          type="submit"
        >
          {pending ? "Opslaan..." : "Opslaan"}
        </button>
      </td>
    </tr>
  );
}

function ChangeTypeActiveToggle({
  id,
  slug,
  name,
  active,
}: {
  id: string;
  slug: string;
  name: string;
  active: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(updateChangeTypeActiveAdmin, initialState);

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="active" value="false" />
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, whiteSpace: "nowrap" }}>
        <input
          aria-label={`${name} actief in frontend`}
          defaultChecked={active}
          disabled={pending}
          name="active"
          onChange={() => {
            formRef.current?.requestSubmit();
          }}
          value="true"
          type="checkbox"
        />
        Actief in frontend
      </label>
      {pending && <small>Opslaan...</small>}
      {state.issues && <small style={{ color: "var(--danger)" }}>{state.issues.join(" ")}</small>}
      {state.message && !state.issues && <small style={{ color: "var(--accent-deep)" }}>{state.message}</small>}
    </form>
  );
}
