import { z } from "zod"
import { WorkspaceTypeEnum, TeamSizeEnum, PrimaryGoalEnum } from "@/validations/onboarding"

export const updateWorkspaceSettingsSchema = z.object({
  workspaceType:       WorkspaceTypeEnum.optional(),
  teamSize:            TeamSizeEnum.optional(),
  primaryGoal:         PrimaryGoalEnum.optional(),
  onboardingCompleted: z.boolean().optional(),
}).refine(
  (d) =>
    d.workspaceType       !== undefined ||
    d.teamSize            !== undefined ||
    d.primaryGoal         !== undefined ||
    d.onboardingCompleted !== undefined,
  { message: "At least one field must be provided" },
)

export type UpdateWorkspaceSettingsInput = z.infer<typeof updateWorkspaceSettingsSchema>
