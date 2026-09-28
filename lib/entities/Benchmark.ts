import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from "typeorm";

/**
 * Benchmark (referentie-index) used for performance comparison.
 * Maps to client_config.benchmark.
 */
@Entity({ schema: "client_config", name: "benchmark" })
export class Benchmark {
  @PrimaryGeneratedColumn({ type: "bigint", name: "benchmark_id" })
  benchmarkId!: number;

  @Column({ type: "varchar", length: 60, unique: true })
  benchmarkCode!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  benchmarkName!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  rimesCode!: string | null;
}
