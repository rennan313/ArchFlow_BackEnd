import { type NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { signAccessToken } from "@/lib/jwt"
import { ok, internalError } from "@/lib/response"
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

    // Find existing user or create new one
    let user = await prisma.user.findUnique({ where: { email: input.email } })

    if (!user) {
      user = await prisma.user.create({
        data: {
          email:    input.email,
          name:     input.name,
          image:    input.image ?? null,
          googleId: input.googleId,
          provider: "google",
          lastLogin: new Date(),
        },
      })
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data:  {
          name:      input.name,
          image:     input.image ?? user.image,
          googleId:  user.googleId ?? input.googleId,
          lastLogin: new Date(),
        },
      })
    }

    const payload     = { sub: user.id, email: user.email, role: user.role }
    const accessToken = signAccessToken(payload)

    return ok({
      user: {
        id:    user.id,
        name:  user.name,
        email: user.email,
        image: user.image,
        role:  user.role,
      },
      accessToken,
    })
  } catch (error) {
    console.error("[google-signin]", error)
    return handleServiceError(error)
  }
}
