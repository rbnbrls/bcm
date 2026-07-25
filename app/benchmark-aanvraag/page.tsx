import { NewBenchmarkForm } from "@/components/benchmark-new-form";
import { getClientConfigs } from "@/lib/db";

export default async function NewBenchmarkPage() {
  const clients = await getClientConfigs();

  return (
    <div className="page-shell request-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">CHANGE REQUEST · 02</p>
          <h1>Nieuwe benchmark</h1>
          <p>Vraag een nieuwe benchmark aan die nog niet in de catalogus staat. Doorlooptijd circa 4 weken, geschatte kosten € 5.000.</p>
        </div>
        <div className="standard-note">
          <b>Nieuw verzoek</b>
          <span>Short name · Long name · Asset class · Valuta</span>
        </div>
      </div>
      <NewBenchmarkForm clients={clients} />
    </div>
  );
}
