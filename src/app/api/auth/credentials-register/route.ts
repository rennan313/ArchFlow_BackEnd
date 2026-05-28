import { type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/hash"
import { buildPayload, signAccessToken } from "@/lib/jwt"
import { credentialsRegisterSchema } from "@/validations/auth"
import { created, conflict } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"

export async function POST(req: NextRequest) {
  try {
    const body  = await req.json()
    const input = credentialsRegisterSchema.parse(body)

    const existing = await prisma.user.findUnique({ where: { email: input.email } })

    if (existing) {
      // If account exists via Google, inform the user
      if (!existing.password && existing.googleId) {
        return conflict("This email is already registered with Google. Please sign in with Google.")
      }
      return conflict("This email is already registered.")
    }

    const hashed = await hashPassword(input.password)

    const user = await prisma.user.create({
      data: {
        name:          input.name,
        email:         input.email,
        password:      hashed,
        provider:      "credentials",
        workspaceType: input.workspaceType,
        teamSize:      input.teamSize,
        primaryGoal:   input.primaryGoal,
        lastLogin:     new Date(),
      },
    })

    const accessToken = signAccessToken(buildPayload(user))

    return created({
      user: {
        id:                 user.id,
        name:               user.name,
        email:              user.email,
        image:              user.image,
        role:               user.role,
        onboardingCompleted: user.onboardingCompleted,
        onboardingStep:     user.onboardingStep,
      },
      accessToken,
    }, "Account created successfully")
  } catch (error) {
    return handleServiceError(error)
  }
}
