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
        href: "/changes/new",
        description: "Start een nieuwe benchmark wijziging",
      },
      {
        label: "Change catalogus →",
        href: "/change-catalog",
        description: "Bekijk beschikbare change types en doorlooptijden",
      },
      {
        label: "Benchmark catalogus →",
        href: "/benchmarks",
        description: "Bekijk beschikbare benchmarks",
      },
      {
        label: "Nieuwe benchmark aanvragen →",
        href: "/benchmark-aanvraag",
        description: "Vraag een nieuwe benchmark aan",
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
        href: "/reports",
        description: "Alle beschikbare rapportages",
      },
      {
        label: "Kostensrapportage →",
        href: "/reports/costs",
        description: "Overzicht van kosten per type",
      },
      {
        label: "Verwerkingstijd →",
        href: "/reports/processing-time",
        description: "Doorlooptijden rapportage",
      },
      {
        label: "Volume rapportage →",
        href: "/reports/volume",
        description: "Volume per klant en type",
      },
      {
        label: "Beheer dashboard →",
        href: "/admin",
        description: "Systeem beheer en configuratie",
      },
      {
        label: "Webhooks →",
        href: "/admin/webhooks",
        description: "Webhook configuratie",
      },
      {
        label: "Change catalogus →",
        href: "/admin/change-types",
        description: "Beheer change types in de catalogus",
      },
      {
        label: "Benchmark import →",
        href: "/admin/benchmarks/import",
        description: "Importeer benchmark data",
      },
    ],
  },
];
