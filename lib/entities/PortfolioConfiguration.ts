import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { NpcClassification } from "./NpcClassification";

@Entity({ schema: "client_config", name: "portfolio_configuration" })
export class PortfolioConfiguration {
  @PrimaryColumn({ type: "varchar", length: 30 })
  primaryAccountId!: string;

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

  @Column({ type: "boolean", name: "active_ind", default: true })
  activeInd!: boolean;

  @Column({ type: "date", name: "effective_from" })
  effectiveFrom!: Date;

  @Column({ type: "date", name: "effective_until", nullable: true })
  effectiveUntil!: Date | null;

  @Column({ type: "uuid", name: "change_request_id", nullable: true, unique: true })
  changeRequestId!: string | null;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;

  @ManyToOne(() => NpcClassification, (npc) => npc.portfolioConfigurations)
  @JoinColumn({ name: "npc_classification_id" })
  npcClassification!: NpcClassification;
}
