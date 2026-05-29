import { type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/hash"
import { buildPayload, signAccessToken } from "@/lib/jwt"
import { credentialsRegisterSchema } from "@/validations/auth"
import { workspaceService } from "@/services/workspace.service"
import { created, conflict } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"

export async function POST(req: NextRequest) {
  try {
    const body  = await req.json()
    const input = credentialsRegisterSchema.parse(body)

    const existing = await prisma.user.findUnique({ where: { email: input.email } })

    if (existing) {
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

    // Auto-create workspace — user becomes OWNER
    await workspaceService.createForUser(user.id, user.name)
    const refreshed = await prisma.user.findUnique({ where: { id: user.id } })

    const accessToken = signAccessToken(buildPayload(refreshed!))

    return created(
      {
        user: {
          id:                  refreshed!.id,
          name:                refreshed!.name,
          email:               refreshed!.email,
          image:               refreshed!.image,
          role:                refreshed!.role,
          workspaceId:         refreshed!.workspaceId,
          workspaceRole:       refreshed!.workspaceRole,
          onboardingCompleted: refreshed!.onboardingCompleted,
          onboardingStep:      refreshed!.onboardingStep,
        },
        accessToken,
      },
      "Account created successfully",
    )
  } catch (error) {
    return handleServiceError(error)
  }
}
