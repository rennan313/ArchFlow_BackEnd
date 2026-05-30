import { type NextRequest } from "next/server"
import { z } from "zod"
import { authService } from "@/services/auth.service"
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
    const result = await authService.googleSignIn(input)
    return ok(result)
  } catch (error) {
    return handleServiceError(error)
  }
}
