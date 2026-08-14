import "reflect-metadata";
import { DataSource } from "typeorm";
import {
  LegalEntity,
  ParentAccount,
  Portfolio,
  AssetClass,
  SubAssetClass,
  Manager,
  Benchmark,
  NpcClassification,
  PortfolioConfiguration,
  ChangePortfolioConfiguration,
} from "./index";

/**
 * TypeORM DataSource for the client_config schema.
 *
 * Reads DATABASE_URL from the environment.  Uses the `client_config` schema
 * that was created by scripts/migrate.mjs / db/clientconfig_schema.sql.
 *
 * Example usage:
 * ```ts
 * import { clientConfigDataSource } from "@/lib/entities/ormconfig";
 *
 * const repo = clientConfigDataSource.getRepository(PortfolioConfiguration);
 * const configurations = await repo.find();
 * ```
 */
export const clientConfigDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  schema: "client_config",
  entities: [
    LegalEntity,
    ParentAccount,
    Portfolio,
    AssetClass,
    SubAssetClass,
    Manager,
    Benchmark,
    NpcClassification,
    PortfolioConfiguration,
    ChangePortfolioConfiguration,
  ],
  synchronize: false, // We manage schema via scripts/migrate.mjs
  logging: false,
});
