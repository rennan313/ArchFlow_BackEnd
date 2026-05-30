import { type NextRequest } from "next/server"
import { z } from "zod"
import { withAuth } from "@/middlewares/auth"
import { preferencesRepository } from "@/repositories/preferences.repository"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

const VALID_LANGUAGES = ["pt", "en", "es"] as const
const VALID_THEMES    = ["modern-premium", "luxury-architecture", "dark-future"] as const

const updateSchema = z.object({
  preferredLanguage: z.enum(VALID_LANGUAGES).optional(),
  preferredTheme:    z.enum(VALID_THEMES).optional(),
})

export const GET = withAuth(async (_req: NextRequest, _ctx, user: JwtPayload) => {
  try {
    const prefs = await preferencesRepository.findByUserId(user.sub)
    return ok(prefs ?? { preferredLanguage: "pt", preferredTheme: "modern-premium" })
  } catch (error) {
    return handleServiceError(error)
  }
})

export const PATCH = withAuth(async (req: NextRequest, _ctx, user: JwtPayload) => {
  try {
    const body  = await req.json()
    const input = updateSchema.parse(body)
    const prefs = await preferencesRepository.upsert(user.sub, input)
    return ok(prefs, "Preferences updated")
  } catch (error) {
    return handleServiceError(error)
  }
})
