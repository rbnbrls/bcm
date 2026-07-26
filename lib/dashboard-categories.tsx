import type { ReactNode } from "react";
import {
  ClientIcon,
  BenchmarkIcon,
  MonitorIcon,
  ReportIcon,
  SettingsIcon,
} from "@/lib/dashboard-icons";

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
  {
    id: "benchmark-wijzigingen",
    label: "BENCHMARK WIJZIGINGEN",
    title: "Benchmark wijzigingen",
    subtitle: "Benchmark switch aanvragen →",
    icon: <BenchmarkIcon />,
    actions: [
      {
        label: "Change aanvragen →",
        href: "/changes/new",
        description: "Start een nieuwe benchmark wijziging",
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
    subtitle: "Voortgang bekijken →",
    icon: <MonitorIcon />,
    actions: [
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
    id: "rapportages-analyses",
    label: "RAPPORTAGES & ANALYSES",
    title: "Rapportages & analyses",
    subtitle: "Rapporten inzien →",
    icon: <ReportIcon />,
    actions: [
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
    ],
  },
  {
    id: "beheer",
    label: "BEHEER",
    title: "Beheer",
    subtitle: "Instellingen beheren →",
    icon: <SettingsIcon />,
    actions: [
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
        label: "Change types →",
        href: "/admin/change-types",
        description: "Beheer change type instellingen",
      },
      {
        label: "Benchmark import →",
        href: "/admin/benchmarks/import",
        description: "Importeer benchmark data",
      },
    ],
  },
];
