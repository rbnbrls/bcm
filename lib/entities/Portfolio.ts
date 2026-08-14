import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ParentAccount } from "./ParentAccount";

/**
 * Portfolio (portefeuille) belonging to a parent account.
 * Maps to client_config.portfolio.
 */
@Entity({ schema: "client_config", name: "portfolio" })
export class Portfolio {
  @PrimaryGeneratedColumn({ type: "bigint", name: "portfolio_id" })
  portfolioId!: number;

  @Column({ type: "varchar", length: 15, unique: true })
  portfolioCode!: string;

  @Column({ type: "bigint", name: "parent_account_id", nullable: true })
  parentAccountId!: number | null;

  // ── Relations ──────────────────────────────────────────────────────
  @ManyToOne(() => ParentAccount, (pa) => pa.portfolios)
  @JoinColumn({ name: "parent_account_id" })
  parentAccount!: ParentAccount | null;
}
