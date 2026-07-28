import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from "typeorm";
import { Portfolio } from "./Portfolio";

/**
 * Parent account (hoofdrekening) grouping one or more portfolios.
 * Maps to client_config.parent_account.
 */
@Entity({ schema: "client_config", name: "parent_account" })
export class ParentAccount {
  @PrimaryGeneratedColumn({ type: "bigint", name: "parent_account_id" })
  parentAccountId!: number;

  @Column({ type: "varchar", length: 16, unique: true })
  parentAccountCode!: string;

  @Column({
    type: "varchar",
    length: 16,
    name: "msa_parent_account_code",
    nullable: true,
  })
  msaParentAccountCode!: string | null;

  // ── Relations ──────────────────────────────────────────────────────
  @OneToMany(() => Portfolio, (portfolio) => portfolio.parentAccount)
  portfolios!: Portfolio[];
}
