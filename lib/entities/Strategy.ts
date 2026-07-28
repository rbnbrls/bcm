import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from "typeorm";
import { SubStrategy } from "./SubStrategy";
import { Account } from "./Account";

/**
 * Strategy (strategie) — high-level investment strategy.
 * Maps to client_config.strategy.
 */
@Entity({ schema: "client_config", name: "strategy" })
export class Strategy {
  @PrimaryGeneratedColumn({ type: "smallint", name: "strategy_id" })
  strategyId!: number;

  @Column({ type: "varchar", length: 30, unique: true })
  strategyName!: string;

  // ── Relations ──────────────────────────────────────────────────────
  @OneToMany(() => SubStrategy, (ss) => ss.strategy)
  subStrategies!: SubStrategy[];

  @OneToMany(() => Account, (account) => account.strategy)
  accounts!: Account[];
}
