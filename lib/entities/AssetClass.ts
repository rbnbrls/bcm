import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from "typeorm";
import { SubAssetClass } from "./SubAssetClass";

/**
 * Asset class (asset categorie) — top-level investment category.
 * Maps to client_config.asset_class.
 */
@Entity({ schema: "client_config", name: "asset_class" })
export class AssetClass {
  @PrimaryGeneratedColumn({ type: "smallint", name: "asset_class_id" })
  assetClassId!: number;

  @Column({ type: "char", length: 2, unique: true })
  assetClassCode!: string;

  @Column({ type: "varchar", length: 30, unique: true })
  assetClassName!: string;

  // ── Relations ──────────────────────────────────────────────────────
  @OneToMany(() => SubAssetClass, (sac) => sac.assetClass)
  subAssetClasses!: SubAssetClass[];
}
