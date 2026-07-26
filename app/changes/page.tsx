import { getAllChangeRequests } from "@/lib/db";
import ChangesDashboardClient from "./changes-dashboard-client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ status?: string; sla_status?: string }>;

export default async function ChangesOverviewPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const changes = await getAllChangeRequests();
  const initialStatus = searchParams.status ?? "";
  const initialSlaStatus = searchParams.sla_status ?? "";

  return (
    <ChangesDashboardClient
      initialData={changes}
      initialStatus={initialStatus}
      initialSlaStatus={initialSlaStatus}
    />
  );
}
