import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from "typeorm";
import { Account } from "./Account";

/**
 * Classification (classificatie) of accounts by a categorisation scheme.
 * Maps to client_config.classification.
 */
@Entity({ schema: "client_config", name: "classification" })
export class Classification {
  @PrimaryGeneratedColumn({ type: "smallint", name: "classification_id" })
  classificationId!: number;

  @Column({ type: "varchar", length: 10, unique: true })
  classificationCode!: string;

  // ── Relations ──────────────────────────────────────────────────────
  @OneToMany(() => Account, (account) => account.classification)
  accounts!: Account[];
}
