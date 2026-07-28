import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Unique,
} from "typeorm";
import { AssetClass } from "./AssetClass";
import { Account } from "./Account";

/**
 * Sub asset class (sub asset categorie) — detailed classification within an asset class.
 * Maps to client_config.sub_asset_class.
 * UNIQUE(asset_class_id, sub_asset_class_code) and UNIQUE(asset_class_id, sub_asset_class_name).
 */
@Entity({ schema: "client_config", name: "sub_asset_class" })
@Unique("uq_sub_asset_class_code", ["assetClassId", "subAssetClassCode"])
@Unique("uq_sub_asset_class_name", ["assetClassId", "subAssetClassName"])
export class SubAssetClass {
  @PrimaryGeneratedColumn({ type: "smallint", name: "sub_asset_class_id" })
  subAssetClassId!: number;

  @Column({ type: "smallint", name: "asset_class_id" })
  assetClassId!: number;

  @Column({ type: "char", length: 3 })
  subAssetClassCode!: string;

  @Column({ type: "varchar", length: 50 })
  subAssetClassName!: string;

  // ── Relations ──────────────────────────────────────────────────────
  @ManyToOne(() => AssetClass, (ac) => ac.subAssetClasses)
  @JoinColumn({ name: "asset_class_id" })
  assetClass!: AssetClass;

  @OneToMany(() => Account, (account) => account.subAssetClass)
  accounts!: Account[];
}
