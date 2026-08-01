import { AssetClassRequestForm } from "@/components/asset-class-request-form";
import { getClientConfigs } from "@/lib/db";

export default async function NewAssetClassPage() {
  const clients = await getClientConfigs();

  return (
    <div className="page-shell request-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">CHANGE REQUEST · 03</p>
          <h1>Nieuwe asset class</h1>
          <p>Vraag een nieuwe asset class aan die nog niet in de referentiedata staat. Doorlooptijd circa 3 weken, geschatte kosten € 2.500.</p>
        </div>
        <div className="standard-note">
          <b>Nieuw verzoek</b>
          <span>Code · Naam · Optioneel sub asset classes</span>
        </div>
      </div>
      <AssetClassRequestForm clients={clients} />
    </div>
  );
}
