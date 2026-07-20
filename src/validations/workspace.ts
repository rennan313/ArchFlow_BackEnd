import { z } from "zod"

export const WorkspaceRoleEnum = z.enum(["OWNER","ADMIN","ARCHITECT","DESIGNER","ASSISTANT","VIEWER"])

export const inviteUserSchema = z.object({
  email: z.string().email(),
  role:  WorkspaceRoleEnum.default("ARCHITECT"),
})

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
})

// OWNER cannot be assigned via this endpoint — ownership transfer is a dedicated OWNER-only flow
export const updateUserRoleSchema = z.object({
  userId: z.string().min(1),
  role:   z.enum(["ADMIN", "ARCHITECT", "DESIGNER", "ASSISTANT", "VIEWER"]),
})

export const removeUserSchema = z.object({
  userId: z.string().min(1),
})

export const cancelInviteSchema = z.object({
  inviteId: z.string().min(1),
})

export const updateDashboardLayoutSchema = z.object({
  order:  z.array(z.string()),
  hidden: z.array(z.string()),
})

// Worklog Sprint V2, MEL-01 — validated against the runtime's own IANA
// database (Intl.supportedValuesOf) rather than a hand-maintained list, so it
// never drifts from what Intl.DateTimeFormat({ timeZone }) actually accepts
// elsewhere in this codebase (worklogSummary.service.ts's day/week bucketing).
export const updateWorkspaceSettingsSchema = z.object({
  timezone: z.string().min(1).max(64).refine(
    (tz) => Intl.supportedValuesOf("timeZone").includes(tz),
    { message: "Unknown IANA timezone" },
  ).nullable().optional(),
})

export type InviteUserInput      = z.infer<typeof inviteUserSchema>
export type AcceptInviteInput    = z.infer<typeof acceptInviteSchema>
export type UpdateUserRoleInput  = z.infer<typeof updateUserRoleSchema>
export type CancelInviteInput    = z.infer<typeof cancelInviteSchema>
export type UpdateDashboardLayoutInput = z.infer<typeof updateDashboardLayoutSchema>
export type UpdateWorkspaceSettingsInput = z.infer<typeof updateWorkspaceSettingsSchema>
