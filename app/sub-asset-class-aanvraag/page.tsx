import { SubAssetClassRequestForm } from "@/components/sub-asset-class-request-form";
import { getClientConfigs } from "@/lib/db";
import { getClientConfigReferenceData } from "@/lib/client-config-db";

export default async function NewSubAssetClassPage() {
  const [clients, referenceData] = await Promise.all([
    getClientConfigs(),
    getClientConfigReferenceData(),
  ]);

  return (
    <div className="page-shell request-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">CHANGE REQUEST · 04</p>
          <h1>Nieuwe sub asset class</h1>
          <p>Vraag een nieuwe sub asset class aan onder een bestaande asset class. Doorlooptijd circa 2 weken, geschatte kosten € 1.500.</p>
        </div>
        <div className="standard-note">
          <b>Nieuw verzoek</b>
          <span>Bestaande asset class · Code · Naam</span>
        </div>
      </div>
      <SubAssetClassRequestForm clients={clients} assetClasses={referenceData.assetClasses} />
    </div>
  );
}
