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

export type InviteUserInput      = z.infer<typeof inviteUserSchema>
export type AcceptInviteInput    = z.infer<typeof acceptInviteSchema>
export type UpdateUserRoleInput  = z.infer<typeof updateUserRoleSchema>
