import Link from "next/link";
import { getChangeTypes } from "@/lib/db";
import {
  sortChangeTypes,
  formatCurrency,
  formatLeadDays,
  formatCategoryLabel,
} from "@/lib/change-type-catalog";

export default async function AdminChangeTypesPage() {
  const changeTypes = sortChangeTypes(await getChangeTypes());

  return (
    <div className="page-shell">
      <div className="page-intro" style={{ alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow">ADMIN · CHANGE CATALOGUS</p>
          <h1>Change types</h1>
          <p>Beheer de beschikbare change types, inclusief kosten, doorlooptijd, velden en stakeholders. Wijzigingen zijn direct zichtbaar in de change catalogus.</p>
        </div>
      </div>

      {changeTypes.length === 0 ? (
        <div className="empty-state" style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>
          <p>Geen change types gevonden.</p>
        </div>
      ) : (
        <div className="config-table-wrap" style={{ marginTop: 24 }}>
          <table className="config-table">
            <thead>
              <tr>
                <th>Naam</th>
                <th>Categorie</th>
                <th>Kosten</th>
                <th>Doorlooptijd</th>
                <th>Velden</th>
                <th>Stakeholders</th>
                <th>Status</th>
                <th>Volgorde</th>
              </tr>
            </thead>
            <tbody>
              {changeTypes.map((ct) => (
                <tr key={ct.id}>
                  <td>
                    <b>{ct.name}</b>
                    <small>{ct.slug}</small>
                  </td>
                  <td><span style={{ fontSize: 13 }}>{formatCategoryLabel(ct.category)}</span></td>
                  <td>
                    <span style={{ fontSize: 13 }}>
                      Vanaf {formatCurrency(ct.cost.baseCost, ct.cost.costCurrency)}
                    </span>
                  </td>
                  <td><span style={{ fontSize: 13 }}>{formatLeadDays(ct.defaultLeadDays)}</span></td>
                  <td><span style={{ fontSize: 13 }}>{ct.fields.length} veld{ct.fields.length !== 1 ? "en" : ""}</span></td>
                  <td><span style={{ fontSize: 13 }}>{ct.stakeholders.length} </span></td>
                  <td>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 8px", borderRadius: 100, fontSize: 11,
                      fontWeight: 700,
                      background: ct.active ? "var(--mint)" : "#eef1ed",
                      color: ct.active ? "var(--accent-deep)" : "var(--muted)",
                    }}>
                      {ct.active ? "Actief" : "Inactief"}
                    </span>
                  </td>
                  <td><span style={{ fontSize: 13 }}>{ct.sortOrder}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <p style={{ fontSize: 12, color: "var(--muted)" }}>
          Change types worden beheerd via de database en API. Voeg nieuwe types toe via de <code>getDefaultChangeTypeConfigs()</code> functie in <code>lib/db.ts</code>.
        </p>
      </div>
    </div>
  );
}
