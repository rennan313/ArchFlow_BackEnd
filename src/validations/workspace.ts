import { z } from "zod"

export const WorkspaceRoleEnum = z.enum(["OWNER","ADMIN","ARCHITECT","DESIGNER","ASSISTANT","VIEWER"])

export const inviteUserSchema = z.object({
  email: z.string().email(),
  role:  WorkspaceRoleEnum.default("ARCHITECT"),
})

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
})

export const updateUserRoleSchema = z.object({
  userId: z.string().min(1),
  role:   WorkspaceRoleEnum,
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

export type InviteUserInput      = z.infer<typeof inviteUserSchema>
export type AcceptInviteInput    = z.infer<typeof acceptInviteSchema>
export type UpdateUserRoleInput  = z.infer<typeof updateUserRoleSchema>
export type CancelInviteInput    = z.infer<typeof cancelInviteSchema>
export type UpdateDashboardLayoutInput = z.infer<typeof updateDashboardLayoutSchema>
