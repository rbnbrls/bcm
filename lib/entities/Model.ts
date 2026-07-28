import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from "typeorm";
import { Account } from "./Account";

/**
 * Model (model) classifying accounts by a model portfolio reference.
 * Maps to client_config.model.
 */
@Entity({ schema: "client_config", name: "model" })
export class Model {
  @PrimaryGeneratedColumn({ type: "bigint", name: "model_id" })
  modelId!: number;

  @Column({ type: "varchar", length: 10, unique: true })
  modelCode!: string;

  // ── Relations ──────────────────────────────────────────────────────
  @OneToMany(() => Account, (account) => account.model)
  accounts!: Account[];
}
