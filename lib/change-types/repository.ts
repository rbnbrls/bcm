export {
  DEFAULT_CHANGE_TYPE_CONFIGS,
  getChangeTypeById,
  getChangeTypeBySlug,
  getChangeTypes,
  seedChangeTypeConfigs,
  updateChangeTypeActive,
  updateChangeTypeConfig,
  updateChangeTypeDefinition,
} from "@/lib/db";

export type {
  UpdateChangeTypeActiveInput,
  UpdateChangeTypeConfigInput,
  UpdateChangeTypeDefinitionInput,
} from "@/lib/db";
