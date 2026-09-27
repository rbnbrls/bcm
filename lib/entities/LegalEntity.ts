import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from "typeorm";

/**
 * Legal entity (rechtsvorm) — top-level counterparty.
 * Maps to client_config.legal_entity.
 */
@Entity({ schema: "client_config", name: "legal_entity" })
export class LegalEntity {
  @PrimaryGeneratedColumn({ type: "bigint", name: "legal_entity_id" })
  legalEntityId!: number;

  @Column({ type: "varchar", length: 100, unique: true })
  legalName!: string;
}
