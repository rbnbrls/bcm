import { z } from "zod";

export const workflowParallelSplitConfigurationSchema = z.object({
  label: z.string().trim().min(1).max(80).default("Parallel split"),
}).strict();

export const workflowParallelJoinModeSchema = z.enum(["and", "or", "quorum"]);

export const workflowParallelJoinConfigurationSchema = z.object({
  label: z.string().trim().min(1).max(80).default("Parallel join"),
  mode: workflowParallelJoinModeSchema.default("and"),
  quorum: z.number().int().min(1).max(50).optional(),
}).strict().superRefine((value, context) => {
  if (value.mode === "quorum" && value.quorum === undefined) {
    context.addIssue({
      code: "custom",
      path: ["quorum"],
      message: "Quorum is verplicht wanneer de joinmodus quorum is.",
    });
  }
  if (value.mode !== "quorum" && value.quorum !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["quorum"],
      message: "Quorum mag alleen gevuld zijn voor de joinmodus quorum.",
    });
  }
});

export type WorkflowParallelJoinMode = z.infer<typeof workflowParallelJoinModeSchema>;
export type WorkflowParallelSplitConfiguration = z.infer<typeof workflowParallelSplitConfigurationSchema>;
export type WorkflowParallelJoinConfiguration = z.infer<typeof workflowParallelJoinConfigurationSchema>;
