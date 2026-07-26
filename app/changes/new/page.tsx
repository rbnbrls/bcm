import { GenericChangeForm } from "@/components/generic-change-form";
import { getClientConfigs, getChangeTypes } from "@/lib/db";
import { sortChangeTypes, getActiveChangeTypes } from "@/lib/change-type-catalog";

type Props = {
  searchParams?: Promise<{ type?: string }>;
};

export default async function NewChangeRequestPage({ searchParams }: Props) {
  const [clients, changeTypes] = await Promise.all([getClientConfigs(), getChangeTypes()]);

  let preselectedType: string | undefined;
  const params = searchParams ? await searchParams : undefined;
  if (params?.type) {
    // Verify the requested type exists and is active
    const matching = changeTypes.find((ct) => ct.slug === params.type && ct.active);
    if (matching) preselectedType = matching.slug;
  }

  return (
    <div className="page-shell request-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">CHANGE REQUEST</p>
          <h1>Nieuwe change</h1>
          <p>Kies een change type en vul de benodigde gegevens in. Hetzelfde 4-stappenpatroon voor elk type wijziging.</p>
        </div>
        <div className="standard-note">
          <b>First time right</b>
          <span>Verplichte informatie wordt gevalideerd vóór verzending.</span>
        </div>
      </div>
      <GenericChangeForm clients={clients} changeTypes={changeTypes} preselectedType={preselectedType} />
    </div>
  );
}
