import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { onboardingService } from "@/services/onboarding/onboarding.service"
import { updateOnboardingSchema } from "@/validations/onboarding"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

// GET /api/users/onboarding — current onboarding status
export const GET = withAuth(async (_req: NextRequest, _ctx: Ctx, user: JwtPayload) => {
  try {
    const status = await onboardingService.getStatus(user.sub)
    return ok(status)
  } catch (error) {
    return handleServiceError(error)
  }
})

// PATCH /api/users/onboarding — update onboarding step/fields
export const PATCH = withAuth(async (req: NextRequest, _ctx: Ctx, user: JwtPayload) => {
  try {
    const body   = await req.json()
    const input  = updateOnboardingSchema.parse(body)
    const status = await onboardingService.update(user.sub, input)

    return ok(status, status.onboardingCompleted ? "Onboarding completed" : "Onboarding updated")
  } catch (error) {
    return handleServiceError(error)
  }
})
