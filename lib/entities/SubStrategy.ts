import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Unique,
} from "typeorm";
import { Strategy } from "./Strategy";
import { Account } from "./Account";

/**
 * Sub strategy (sub strategie) — detailed strategy classification.
 * Maps to client_config.sub_strategy.
 * UNIQUE(strategy_id, sub_strategy_name).
 */
@Entity({ schema: "client_config", name: "sub_strategy" })
@Unique("uq_sub_strategy_name", ["strategyId", "subStrategyName"])
export class SubStrategy {
  @PrimaryGeneratedColumn({ type: "smallint", name: "sub_strategy_id" })
  subStrategyId!: number;

  @Column({ type: "smallint", name: "strategy_id" })
  strategyId!: number;

  @Column({ type: "varchar", length: 50 })
  subStrategyName!: string;

  // ── Relations ──────────────────────────────────────────────────────
  @ManyToOne(() => Strategy, (s) => s.subStrategies)
  @JoinColumn({ name: "strategy_id" })
  strategy!: Strategy;

  @OneToMany(() => Account, (account) => account.subStrategy)
  accounts!: Account[];
}
