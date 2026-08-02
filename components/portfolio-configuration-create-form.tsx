"use client";

/**
 * PortfolioConfigurationCreateForm — the explicit-client create form for the
 * `portfolio_configuration_create` change type.
 *
 * Unlike the legacy `portfolio_addition` wizard (which derives the client from
 * the first three characters of the portfolio code), this form requires the
 * user to explicitly select an existing `client_config.client`. The selected
 * client code is submitted as `clientCode` and honored by the
 * `createPortfolioAdditionChange` server action (portfolio-actions.ts), which
 * validates it against the client reference data.
 *
 * The wizard is shared with PortfolioAdditionForm; this component pins the
 * change type slug to `portfolio_configuration_create` and switches on
 * explicit client selection (`requireClient`). Portfolio metadata — portfolio
 * code (selectable from the selected client's active portfolios or enterable),
 * long name and short name — plus the dimension reference data (asset class,
 * sub asset class, manager, benchmark, NPC classification) and the effective
 * date are collected by the underlying wizard.
 */
import { PortfolioAdditionForm } from "@/components/portfolio-addition-form";
import type {
  ClientConfigAssetClass,
  ClientConfigBenchmark,
  ClientConfigClient,
  ClientConfigManager,
  ClientConfigNpcClassification,
  ClientConfigPortfolio,
  ClientConfigSubAssetClass,
} from "@/lib/types";

type Props = {
  /** Reference-data clients (client_config.client) to choose from. */
  clients: ClientConfigClient[];
  /** Reference-data portfolios (client_config.portfolio) for suggestions. */
  portfolios: ClientConfigPortfolio[];
  benchmarks: ClientConfigBenchmark[];
  assetClasses: ClientConfigAssetClass[];
  subAssetClasses: ClientConfigSubAssetClass[];
  managers: ClientConfigManager[];
  npcClassifications: ClientConfigNpcClassification[];
};

export function PortfolioConfigurationCreateForm(props: Props) {
  return (
    <PortfolioAdditionForm
      changeTypeSlug="portfolio_configuration_create"
      requireClient
      {...props}
    />
  );
}
