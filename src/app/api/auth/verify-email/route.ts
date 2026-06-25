import { type NextRequest } from "next/server"
import { authService } from "@/services/auth.service"
import { verifyEmailSchema } from "@/validations/auth"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"

export async function POST(req: NextRequest) {
  try {
    const body  = await req.json()
    const input = verifyEmailSchema.parse(body)
    await authService.verifyEmail(input)
    return ok(null, "Email verified successfully")
  } catch (error) {
    return handleServiceError(error)
  }
}
