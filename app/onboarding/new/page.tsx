import { redirect } from "next/navigation";

export default function NewCustomerPage() {
  redirect("/changes/new?type=client_onboarding");
}
