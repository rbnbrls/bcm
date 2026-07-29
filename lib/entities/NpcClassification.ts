import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from "typeorm";
import { PortfolioConfiguration } from "./PortfolioConfiguration";

@Entity({ schema: "client_config", name: "npc_classification" })
export class NpcClassification {
  @PrimaryGeneratedColumn({ type: "smallint", name: "npc_classification_id" })
  npcClassificationId!: number;

  @Column({ type: "varchar", length: 80, unique: true })
  classificationName!: string;

  @OneToMany(() => PortfolioConfiguration, (pc) => pc.npcClassification)
  portfolioConfigurations!: PortfolioConfiguration[];
}
