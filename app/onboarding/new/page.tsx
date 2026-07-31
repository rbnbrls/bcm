import { getWtpClassifications, getManagers, getBenchmarkGroups } from "@/lib/db";
import { getClientConfigAssetClassAdminRows } from "@/lib/client-config-db";
import { OnboardingForm } from "./onboarding-form";

export default async function NewCustomerPage() {
  const [wtpClassifications, assetClassRows, managers, benchmarkGroups] = await Promise.all([
    getWtpClassifications(),
    getClientConfigAssetClassAdminRows(),
    getManagers(),
    getBenchmarkGroups(),
  ]);

  return (
    <div className="page-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">NIEUWE KLANT</p>
          <h1>Klant onboarden</h1>
          <p>Voer de gegevens in om een nieuwe klant te onboarden. Er wordt automatisch een change request aangemaakt om het proces te volgen.</p>
        </div>
        <div className="standard-note">
          <b>Regeling</b>
          <span>Kies FPR (Flexibele Premieregeling) of SPR (Solidaire Premieregeling).</span>
        </div>
      </div>
      <OnboardingForm
        wtpClassifications={wtpClassifications}
        assetClassRows={assetClassRows}
        managers={managers}
        benchmarkGroups={benchmarkGroups}
      />
    </div>
  );
}
