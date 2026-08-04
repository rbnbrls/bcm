import Link from "next/link";
import { notFound } from "next/navigation";
import { getChangeTypeById, getChangeTypeBySlug } from "@/lib/change-types/repository";
import { ChangeTypeDefinitionForm } from "./change-type-definition-form";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminChangeTypeDetailPage({ params }: Props) {
  const { id } = await params;
  const changeType = (await getChangeTypeById(id)) ?? (await getChangeTypeBySlug(id));

  if (!changeType) notFound();

  return (
    <div className="page-shell">
      <div className="page-intro" style={{ alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow">ADMIN · CHANGE PROCES</p>
          <h1>{changeType.name}</h1>
          <p>Beheer de volledige definitie van dit change proces: formulier, betrokkenen, procesflow, kosten en doorlooptijd.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="button button-ghost" href="/admin/change-types">Terug</Link>
          <Link className="button button-secondary" href={`/change-catalog/${changeType.slug}`}>Publieke preview</Link>
        </div>
      </div>

      <ChangeTypeDefinitionForm changeType={changeType} />
    </div>
  );
}
