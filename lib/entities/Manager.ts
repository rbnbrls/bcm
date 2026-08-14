import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from "typeorm";

/**
 * Manager (beheerder) responsible for managing accounts.
 * Maps to client_config.manager.
 */
@Entity({ schema: "client_config", name: "manager" })
export class Manager {
  @PrimaryGeneratedColumn({ type: "smallint", name: "manager_id" })
  managerId!: number;

  @Column({ type: "char", length: 3, unique: true })
  managerCode!: string;

  @Column({ type: "varchar", length: 50, unique: true })
  managerName!: string;
}
