import { type NextRequest } from "next/server"
import { authService } from "@/services/auth.service"
import { credentialsRegisterSchema } from "@/validations/auth"
import { created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"

export async function POST(req: NextRequest) {
  try {
    const body  = await req.json()
    const input = credentialsRegisterSchema.parse(body)
    const result = await authService.register(input)
    return created(result, "Account created successfully")
  } catch (error) {
    return handleServiceError(error)
  }
}
