import { redirect } from "next/navigation";
import { getIdentityContext } from "@/lib/identity/request";
import { authorizeWorkflowStudioRoute } from "@/lib/workflow-studio/route-access";

export default async function WorkflowStudioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const identity = await getIdentityContext();
  if (!authorizeWorkflowStudioRoute(identity, "/workflow-studio").authorized) redirect("/");
  return children;
}
