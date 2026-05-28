import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { prisma } from "@/lib/prisma"
import { updateWorkspaceSettingsSchema } from "@/validations/settings"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// GET /api/settings/workspace — fetch current workspace preferences
export const GET = withAuth(async (_req: NextRequest, _ctx: Ctx, user: JwtPayload) => {
  try {
    const data = await prisma.user.findUnique({
      where:  { id: user.sub },
      select: {
        workspaceType:       true,
        teamSize:            true,
        primaryGoal:         true,
        onboardingCompleted: true,
        updatedAt:           true,
      },
    })

    if (!data) {
      const { notFound } = await import("@/lib/response")
      return notFound("User not found")
    }

    return ok({
      workspaceType:       data.workspaceType ?? null,
      teamSize:            data.teamSize      ?? null,
      primaryGoal:         data.primaryGoal   ?? null,
      onboardingCompleted: data.onboardingCompleted,
      updatedAt:           data.updatedAt,
    })
  } catch (error) {
    return handleServiceError(error)
  }
})

// PATCH /api/settings/workspace — update workspace preferences
export const PATCH = withAuth(async (req: NextRequest, _ctx: Ctx, user: JwtPayload) => {
  try {
    const body  = await req.json()
    const input = updateWorkspaceSettingsSchema.parse(body)

    const updated = await prisma.user.update({
      where: { id: user.sub },
      data: {
        ...(input.workspaceType       !== undefined && { workspaceType:       input.workspaceType }),
        ...(input.teamSize            !== undefined && { teamSize:             input.teamSize }),
        ...(input.primaryGoal         !== undefined && { primaryGoal:          input.primaryGoal }),
        ...(input.onboardingCompleted !== undefined && { onboardingCompleted:  input.onboardingCompleted }),
      },
      select: {
        workspaceType:       true,
        teamSize:            true,
        primaryGoal:         true,
        onboardingCompleted: true,
        updatedAt:           true,
      },
    })

    return ok(
      {
        workspaceType:       updated.workspaceType ?? null,
        teamSize:            updated.teamSize      ?? null,
        primaryGoal:         updated.primaryGoal   ?? null,
        onboardingCompleted: updated.onboardingCompleted,
        updatedAt:           updated.updatedAt,
      },
      "Workspace preferences updated successfully",
    )
  } catch (error) {
    return handleServiceError(error)
  }
})
