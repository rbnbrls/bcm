import { getChangeTypes } from "@/lib/change-types/repository";
import { sortChangeTypes } from "@/lib/change-type-catalog";
import { ChangeTypeAdminTable } from "./change-type-admin-table";

export default async function AdminChangeTypesPage() {
  const changeTypes = sortChangeTypes(await getChangeTypes());

  return (
    <div className="page-shell">
      <div className="page-intro" style={{ alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow">ADMIN · CHANGE CATALOGUS</p>
          <h1>Change catalogus</h1>
          <p>Beheer het enige beschikbare changeproces voor gebruikers: de benchmark wissel op een bestaande client-config regel.</p>
        </div>
      </div>

      {changeTypes.length === 0 ? (
        <div className="empty-state" style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>
          <p>Geen change types gevonden.</p>
        </div>
      ) : (
        <ChangeTypeAdminTable changeTypes={changeTypes} />
      )}
    </div>
  );
}
