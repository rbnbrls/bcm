import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from "typeorm";
import { Portfolio } from "./Portfolio";
import { AssetClass } from "./AssetClass";
import { SubAssetClass } from "./SubAssetClass";
import { Manager } from "./Manager";
import { LegalEntity } from "./LegalEntity";
import { Model } from "./Model";
import { Classification } from "./Classification";
import { Strategy } from "./Strategy";
import { SubStrategy } from "./SubStrategy";
import { Benchmark } from "./Benchmark";

/**
 * Account — the central entity tying all dimensions together.
 * Maps to client_config.account.
 *
 * The primary_account_id is derived: {portfolio_code}_{asset_class_code}{sub_asset_class_code}_{manager_code}
 * Validated by the trigger trg_validate_account_selection.
 *
 * UNIQUE(portfolio_id, asset_class_id, sub_asset_class_id, manager_id).
 */
@Entity({ schema: "client_config", name: "account" })
@Unique("uq_account_dimensions", [
  "portfolioId",
  "assetClassId",
  "subAssetClassId",
  "managerId",
])
export class Account {
  @PrimaryColumn({ type: "varchar", length: 30 })
  primaryAccountId!: string;

  // ── Foreign key columns (explicit for composite unique) ─────────────

  @Column({ type: "bigint", name: "portfolio_id" })
  portfolioId!: number;

  @Column({ type: "smallint", name: "asset_class_id" })
  assetClassId!: number;

  @Column({ type: "smallint", name: "sub_asset_class_id" })
  subAssetClassId!: number;

  @Column({ type: "smallint", name: "manager_id" })
  managerId!: number;

  @Column({ type: "bigint", name: "legal_entity_id", nullable: true })
  legalEntityId!: number | null;

  @Column({ type: "varchar", length: 3, nullable: true })
  additionalCode!: string | null;

  @Column({ type: "varchar", length: 50 })
  longName!: string;

  @Column({ type: "varchar", length: 30 })
  shortName!: string;

  @Column({ type: "bigint", name: "model_id", nullable: true })
  modelId!: number | null;

  @Column({ type: "smallint", name: "classification_id", nullable: true })
  classificationId!: number | null;

  @Column({ type: "smallint", name: "strategy_id" })
  strategyId!: number;

  @Column({ type: "smallint", name: "sub_strategy_id" })
  subStrategyId!: number;

  @Column({ type: "bigint", name: "benchmark_id", nullable: true })
  benchmarkId!: number | null;

  // ── Relations ──────────────────────────────────────────────────────

  @ManyToOne(() => Portfolio, (p) => p.accounts)
  @JoinColumn({ name: "portfolio_id" })
  portfolio!: Portfolio;

  @ManyToOne(() => AssetClass, (ac) => ac.accounts)
  @JoinColumn({ name: "asset_class_id" })
  assetClass!: AssetClass;

  @ManyToOne(() => SubAssetClass, (sac) => sac.accounts)
  @JoinColumn({ name: "sub_asset_class_id" })
  subAssetClass!: SubAssetClass;

  @ManyToOne(() => Manager, (m) => m.accounts)
  @JoinColumn({ name: "manager_id" })
  manager!: Manager;

  @ManyToOne(() => LegalEntity, (le) => le.accounts)
  @JoinColumn({ name: "legal_entity_id" })
  legalEntity!: LegalEntity | null;

  @ManyToOne(() => Model, (m) => m.accounts)
  @JoinColumn({ name: "model_id" })
  model!: Model | null;

  @ManyToOne(() => Classification, (c) => c.accounts)
  @JoinColumn({ name: "classification_id" })
  classification!: Classification | null;

  @ManyToOne(() => Strategy, (s) => s.accounts)
  @JoinColumn({ name: "strategy_id" })
  strategy!: Strategy;

  @ManyToOne(() => SubStrategy, (ss) => ss.accounts)
  @JoinColumn({ name: "sub_strategy_id" })
  subStrategy!: SubStrategy;

  @ManyToOne(() => Benchmark, (b) => b.accounts)
  @JoinColumn({ name: "benchmark_id" })
  benchmark!: Benchmark | null;
}
