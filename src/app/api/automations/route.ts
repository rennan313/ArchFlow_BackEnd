import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { automationService } from "@/services/automation.service"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withWorkspace(async (_req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    return ok(await automationService.listWithStats(workspaceId))
  } catch (error) { return handleServiceError(error) }
})
