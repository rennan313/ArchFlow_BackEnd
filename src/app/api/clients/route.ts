import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { clientService } from "@/services/client.service"
import { createClientSchema, clientQuerySchema } from "@/validations/client"
import { ok, created } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<Record<string, string>> }

export const GET = withAuth(async (req: NextRequest, _ctx: Ctx, user: JwtPayload) => {
  try {
    const query  = clientQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await clientService.list(user.sub, query)
    return ok(result.data, undefined, result.pagination)
  } catch (error) { return handleServiceError(error) }
})

export const POST = withAuth(async (req: NextRequest, _ctx: Ctx, user: JwtPayload) => {
  try {
    const input  = createClientSchema.parse(await req.json())
    const client = await clientService.create(user.sub, input)
    return created(client, "Client created successfully")
  } catch (error) { return handleServiceError(error) }
})
