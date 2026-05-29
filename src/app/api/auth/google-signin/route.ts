import { type NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { buildPayload, signAccessToken } from "@/lib/jwt"
import { workspaceService } from "@/services/workspace.service"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"

const schema = z.object({
  email:    z.string().email(),
  name:     z.string().min(1),
  image:    z.string().url().optional().nullable(),
  googleId: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const body  = await req.json()
    const input = schema.parse(body)

    let user = await prisma.user.findUnique({ where: { email: input.email } })

    if (!user) {
      user = await prisma.user.create({
        data: {
          email:     input.email,
          name:      input.name,
          image:     input.image ?? null,
          googleId:  input.googleId,
          provider:  "google",
          lastLogin: new Date(),
        },
      })
      // Auto-create workspace for new Google users
      await workspaceService.createForUser(user.id, user.name)
      user = await prisma.user.findUnique({ where: { id: user.id } }) ?? user
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data:  {
          name:      input.name,
          image:     input.image ?? user.image ?? null,
          googleId:  user.googleId ?? input.googleId,
          lastLogin: new Date(),
        },
      })
      // Create workspace if somehow missing
      if (!user.workspaceId) {
        await workspaceService.createForUser(user.id, user.name)
        user = await prisma.user.findUnique({ where: { id: user.id } }) ?? user
      }
    }

    const accessToken = signAccessToken(buildPayload(user))

    return ok({
      user: {
        id:                  user.id,
        name:                user.name,
        email:               user.email,
        image:               user.image,
        role:                user.role,
        workspaceId:         user.workspaceId,
        workspaceRole:       user.workspaceRole,
        onboardingCompleted: user.onboardingCompleted,
        onboardingStep:      user.onboardingStep,
      },
      accessToken,
    })
  } catch (error) {
    console.error("[google-signin]", error)
    return handleServiceError(error)
  }
}
