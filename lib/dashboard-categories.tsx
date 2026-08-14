import type { ReactNode } from "react";
import {
  BenchmarkIcon,
  MonitorIcon,
  SettingsIcon,
} from "@/lib/dashboard-icons";

export type DashboardAction = {
  label: string;
  href: string;
  description?: string;
};

export type MainCategory = {
  id: string;
  label: string;
  title: string;
  icon: ReactNode;
  items: DashboardAction[];
};

export const MAIN_CATEGORIES: MainCategory[] = [
  {
    id: "nieuwe-change",
    label: "NIEUWE CHANGE",
    title: "Nieuwe change",
    icon: <BenchmarkIcon />,
    items: [
      {
        label: "Change aanvragen →",
        href: "/change-catalog",
        description: "Kies een gepubliceerde Workflow Studio changes in de change catalog.",
      },
      {
        label: "Changes beheren →",
        href: "/workflow-studio",
        description: "Wijzig of creëer changes via de Workflow Studio.",
      },
    ],
  },
  {
    id: "monitoren-verwerken",
    label: "MONITOREN & VERWERKEN",
    title: "Monitoren & verwerken",
    icon: <MonitorIcon />,
    items: [
      {
        label: "Alle changes →",
        href: "/changes",
        description: "Overzicht van alle wijzigingen",
      },
      {
        label: "Verwerkte changes →",
        href: "/verwerkt",
        description: "Bekijk verwerkte wijzigingen",
      },
      {
        label: "Wijzigingshistorie →",
        href: "/changes/history",
        description: "Historisch overzicht",
      },
      {
        label: "Updates →",
        href: "/updates",
        description: "Systeem updates en meldingen",
      },
    ],
  },
  {
    id: "beheer",
    label: "BEHEER",
    title: "Beheer",
    icon: <SettingsIcon />,
    items: [
      {
        label: "Rapportages →",
        href: "/workflow-runtime",
        description: "Runtime metrics, SLA-risico's, dead letters en adapterfouten",
      },
      {
        label: "Beheer dashboard →",
        href: "/admin",
        description: "Systeem beheer en configuratie",
      },
      {
        label: "Service catalogus →",
        href: "/admin/service-catalog",
        description: "Beschikbare services en klantdiensten vanuit portfolio_configuration",
      },
      {
        label: "Webhooks →",
        href: "/admin/webhooks",
        description: "Webhook configuratie",
      },
    ],
  },
];
