import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { prisma } from "@/lib/prisma"
import { onboardingSchema } from "@/validations/auth"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

export const PATCH = withAuth(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload) => {
  try {
    const body  = await req.json()
    const input = onboardingSchema.parse(body)

    const isComplete = input.complete === true

    const updated = await prisma.user.update({
      where: { id: user.sub },
      data:  {
        ...(input.workspaceType  && { workspaceType:  input.workspaceType }),
        ...(input.teamSize       && { teamSize:        input.teamSize }),
        ...(input.primaryGoal    && { primaryGoal:     input.primaryGoal }),
        ...(input.onboardingStep && { onboardingStep:  input.onboardingStep }),
        ...(isComplete           && { onboardingCompleted: true }),
      },
    })

    return ok({
      onboardingCompleted: updated.onboardingCompleted,
      onboardingStep:      updated.onboardingStep,
      workspaceType:       updated.workspaceType,
      teamSize:            updated.teamSize,
      primaryGoal:         updated.primaryGoal,
    }, isComplete ? "Onboarding completed" : "Onboarding updated")
  } catch (error) {
    return handleServiceError(error)
  }
})

export const GET = withAuth(async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload) => {
  try {
    const u = await prisma.user.findUnique({
      where:  { id: user.sub },
      select: {
        onboardingCompleted: true,
        onboardingStep:      true,
        workspaceType:       true,
        teamSize:            true,
        primaryGoal:         true,
      },
    })
    return ok(u)
  } catch (error) {
    return handleServiceError(error)
  }
})
