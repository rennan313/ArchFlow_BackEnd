import { type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { comparePassword } from "@/lib/hash"
import { signAccessToken } from "@/lib/jwt"
import { credentialsSigninSchema } from "@/validations/auth"
import { ok, unauthorized } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"

export async function POST(req: NextRequest) {
  try {
    const body  = await req.json()
    const input = credentialsSigninSchema.parse(body)

    const user = await prisma.user.findUnique({ where: { email: input.email } })

    // Generic error to prevent email enumeration
    const INVALID = unauthorized("Invalid email or password")

    if (!user) return INVALID

    // Account was created with Google — no password set
    if (!user.password) {
      return unauthorized("This account uses Google Sign-In. Please continue with Google.")
    }

    const valid = await comparePassword(input.password, user.password)
    if (!valid) return INVALID

    await prisma.user.update({
      where: { id: user.id },
      data:  { lastLogin: new Date() },
    })

    const payload     = { sub: user.id, email: user.email, role: user.role, onboardingCompleted: user.onboardingCompleted }
    const accessToken = signAccessToken(payload)

    return ok({
      user: {
        id:                  user.id,
        name:                user.name,
        email:               user.email,
        image:               user.image,
        role:                user.role,
        onboardingCompleted: user.onboardingCompleted,
        onboardingStep:      user.onboardingStep,
      },
      accessToken,
    })
  } catch (error) {
    return handleServiceError(error)
  }
}
