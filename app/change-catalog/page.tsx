import { getChangeTypes } from "@/lib/db";
import {
  sortChangeTypes,
  getActiveChangeTypes,
} from "@/lib/change-type-catalog";
import { ChangeTypeCatalog } from "@/components/change-type-catalog";

export default async function ChangeCatalogPage() {
  const changeTypes = sortChangeTypes(
    getActiveChangeTypes(await getChangeTypes())
  );

  return (
    <div className="page-shell config-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">CHANGE CATALOGUS</p>
          <h1>Change catalogus</h1>
          <p>
            Bekijk alle beschikbare change types met kosten, doorlooptijd en
            processtappen. Kies het type dat bij jouw wijziging past.
          </p>
        </div>
        <div className="standard-note">
          <b>Overzicht</b>
          <span>Categorie · Kosten · Doorlooptijd · Procesflow</span>
        </div>
      </div>

      <ChangeTypeCatalog types={changeTypes} />

      <section className="cost-summary">
        <p className="eyebrow">HOE WERKT HET</p>
        <h2>Een change aanvragen</h2>
        <div className="cost-grid">
          <article className="cost-card">
            <p className="cost-card-type">1. Kies een type</p>
            <p className="cost-card-detail">
              Selecteer het change type dat past bij je wijziging
            </p>
          </article>
          <article className="cost-card">
            <p className="cost-card-type">2. Vul gegevens in</p>
            <p className="cost-card-detail">
              Doorloop het formulier met de specifieke velden voor dit type
            </p>
          </article>
          <article className="cost-card">
            <p className="cost-card-type">3. Verzenden</p>
            <p className="cost-card-detail">
              Dien de change in voor verwerking; je ontvangt een bevestiging
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
