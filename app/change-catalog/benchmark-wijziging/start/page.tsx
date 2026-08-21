import Link from "next/link";

import { sql } from "@/lib/db";
import { getIdentityContext } from "@/lib/identity/request";
import { authorizeWorkflowPermission } from "@/lib/workflow-studio-authorization";
import { getFeatureFlagSnapshot } from "@/lib/feature-flags";
import { BenchmarkWijzigingStartForm } from "./start-form";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function BenchmarkWijzigingStartPage({ params }: Props) {
  const { id } = await params;

  const flags = getFeatureFlagSnapshot();
  if (!flags["workflow_runtime.start"]) {
    return (
      <div className="page-shell">
        <div className="page-intro">
          <div>
            <p className="eyebrow">
              <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
                HOME
              </Link>
              {" · "}
              <Link href="/change-catalog" style={{ color: "inherit", textDecoration: "none" }}>
                CHANGE CATALOGUS
              </Link>
              {" · BENCHMARKWIJZIGING AANVRAAG"}
            </p>
            <h1>Benchmarkwijziging aanvragen</h1>
            <p className="form-errors" role="alert">
              Workflow runtime is nog niet ingeschakeld. Neem contact op met de beheerder.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!sql) {
    return (
      <div className="page-shell">
        <div className="page-intro">
          <div>
            <p className="eyebrow">
              <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
                HOME
              </Link>
              {" · "}
              <Link href="/change-catalog" style={{ color: "inherit", textDecoration: "none" }}>
                CHANGE CATALOGUS
              </Link>
              {" · BENCHMARKWIJZIGING AANVRAAG"}
            </p>
            <h1>Benchmarkwijziging aanvragen</h1>
            <p className="form-errors" role="alert">
              De database is niet beschikbaar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Authorize early so unauthorized users see a clear message before the form.
  const identity = await getIdentityContext();
  const permission = authorizeWorkflowPermission(identity, "workflow:start");
  if (!permission.authorized) {
    return (
      <div className="page-shell">
        <div className="page-intro">
          <div>
            <p className="eyebrow">
              <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
                HOME
              </Link>
              {" · "}
              <Link href="/change-catalog" style={{ color: "inherit", textDecoration: "none" }}>
                CHANGE CATALOGUS
              </Link>
              {" · BENCHMARKWIJZIGING AANVRAAG"}
            </p>
            <h1>Benchmarkwijziging aanvragen</h1>
            <p className="form-errors" role="alert">
              {permission.message}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <BenchmarkWijzigingStartForm workflowId={id} />
    </div>
  );
}
