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
          <h1>Change catalogus</h1>
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
                <th>Flowchart</th>
                <th>Detail</th>
                <th>Status</th>
                <th>Volgorde</th>
              </tr>
            </thead>
            <tbody>
              {changeTypes.map((ct) => (
                <tr key={ct.id}>
                  <td>
                    <Link
                      href={`/change-catalog/${ct.slug}`}
                      style={{ textDecoration: "none" }}
                    >
                      <b>{ct.name}</b>
                      <small>{ct.slug}</small>
                    </Link>
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
                    <a
                      href={`/images/flowcharts/${ct.slug}.svg`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Flowchart: ${ct.name}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--accent)", textDecoration: "none" }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                        <line x1="10" y1="6.5" x2="14" y2="6.5" />
                        <line x1="6.5" y1="10" x2="6.5" y2="14" />
                      </svg>
                      SVG
                    </a>
                  </td>
                  <td>
                    <Link
                      href={`/change-catalog/${ct.slug}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--accent)", textDecoration: "none" }}
                      title={`Detailpagina: ${ct.name}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                      </svg>
                      Open
                    </Link>
                  </td>
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
