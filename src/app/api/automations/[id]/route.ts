import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { automationService } from "@/services/automation.service"
import { patchAutomationSchema } from "@/validations/automation"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = requireWorkspacePermission("manage:automations")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = patchAutomationSchema.parse(await req.json())
    return ok(await automationService.setEnabled(id, workspaceId, input.enabled), "Automation updated")
  } catch (error) { return handleServiceError(error) }
})
