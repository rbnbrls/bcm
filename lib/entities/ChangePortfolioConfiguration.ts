import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity({ schema: "client_config", name: "change_portfolio_configuration" })
export class ChangePortfolioConfiguration {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id!: number;

  @Column({ type: "uuid", name: "change_request_id" })
  changeRequestId!: string;

  @Column({ type: "varchar", length: 10, name: "action_type" })
  actionType!: string;

  @Column({ type: "varchar", length: 3, name: "client_code" })
  clientCode!: string;

  @Column({ type: "varchar", length: 15, name: "portfolio_code" })
  portfolioCode!: string;

  @Column({ type: "char", length: 2, name: "asset_class_code" })
  assetClassCode!: string;

  @Column({ type: "char", length: 3, name: "sub_asset_class_code", default: "" })
  subAssetClassCode!: string;

  @Column({ type: "char", length: 3, name: "manager_code" })
  managerCode!: string;

  @Column({ type: "varchar", length: 60, name: "benchmark_code", default: "" })
  benchmarkCode!: string;

  @Column({ type: "smallint", name: "npc_classification_id" })
  npcClassificationId!: number;

  @Column({ type: "varchar", length: 255, name: "long_name" })
  longName!: string;

  @Column({ type: "varchar", length: 100, name: "short_name" })
  shortName!: string;

  @Column({ type: "date", name: "effective_from" })
  effectiveFrom!: Date;

  @Column({ type: "date", name: "effective_until", nullable: true })
  effectiveUntil!: Date | null;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
