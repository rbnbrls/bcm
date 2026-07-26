import { GenericChangeForm } from "@/components/generic-change-form";
import { getClientConfigs, getChangeTypes } from "@/lib/db";

export default async function NewChangeRequestPage() {
  const [clients, changeTypes] = await Promise.all([getClientConfigs(), getChangeTypes()]);
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
      <GenericChangeForm clients={clients} changeTypes={changeTypes} />
    </div>
  );
}
