import type { ReactNode } from "react";
import { ClientIcon } from "@/lib/dashboard-icons";

export type DashboardAction = {
  label: string;
  href: string;
  description?: string;
};

export type DashboardCategory = {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  actions: DashboardAction[];
};

export const CATEGORIES: DashboardCategory[] = [
  {
    id: "nieuwe-klanten",
    label: "NIEUWE KLANTEN",
    title: "Nieuwe klanten",
    subtitle: "Nieuwe klant configureren →",
    icon: <ClientIcon />,
    actions: [
      {
        label: "Client configuratie →",
        href: "/admin/client-config",
        description: "Bekijk klant-portefeuille koppelingen",
      },
      {
        label: "Client config importeren →",
        href: "/admin/client-config/import",
        description: "Importeer via CSV",
      },
    ],
  },
];
