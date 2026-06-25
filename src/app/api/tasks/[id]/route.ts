import { type NextRequest } from "next/server"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { taskService } from "@/services/task.service"
import { patchTaskSchema } from "@/validations/task"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = requireWorkspacePermission("update:tasks")(async (req: NextRequest, ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const { id } = await ctx.params
    const input  = patchTaskSchema.parse(await req.json())
    return ok(await taskService.setStatus(id, workspaceId, input.status), "Task updated")
  } catch (error) { return handleServiceError(error) }
})
