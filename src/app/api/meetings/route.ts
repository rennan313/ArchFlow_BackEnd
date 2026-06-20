import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { requireWorkspacePermission } from "@/middlewares/rbac"
import { meetingService } from "@/services/meeting.service"
import { createMeetingSchema, meetingQuerySchema } from "@/validations/meeting"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withWorkspace(async (req: NextRequest, _ctx: Ctx, _user: JwtPayload, workspaceId: string) => {
  try {
    const query  = meetingQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await meetingService.list(workspaceId, query)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})

export const POST = requireWorkspacePermission("create:meetings")(async (req: NextRequest, _ctx: Ctx, user: JwtPayload, workspaceId: string) => {
  try {
    const input   = createMeetingSchema.parse(await req.json())
    const meeting = await meetingService.create(workspaceId, user.sub, input)
    return created(meeting, "Meeting created successfully")
  } catch (error) { return handleServiceError(error) }
})
