import { type NextRequest } from "next/server"
import { randomUUID } from "crypto"
import { z } from "zod"
import { provisionService } from "@/services/provision.service"
import { created, notFound } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { authRateLimit } from "@/middlewares/rateLimiter"

// ── Temporary local-dev fallback ──────────────────────────────────────────────
//
// Why this exists: the Supabase project this app normally registers users
// through (ehyaqqmzarjmirhukgcl.supabase.co) no longer resolves, so
// supabase.auth.signUp() in the register page can never succeed until the
// Supabase migration is revisited. This route lets local development
// continue by reusing provisionService.provision() directly — the exact same
// User+Workspace creation logic the real Supabase flow already calls — with
// a synthetic `local:<uuid>` supabaseId instead of a verified Supabase one.
//
// Hard-disabled outside development so it can never be reachable in a real
// deployment. Delete this file (and the matching frontend branch in
// register/page.tsx gated by NEXT_PUBLIC_LOCAL_AUTH_MODE) once Supabase is
// restored — nothing else in the app references it.
const registerLocalSchema = z.object({
  name:     z.string().min(2).max(100).trim(),
  email:    z.string().email().toLowerCase(),
  password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return notFound()

  const limited = await authRateLimit(req)
  if (limited) return limited

  try {
    const body  = await req.json()
    const input = registerLocalSchema.parse(body)

    const result = await provisionService.provision({
      supabaseId: `local:${randomUUID()}`,
      email:      input.email,
      name:       input.name,
      password:   input.password,
    })

    return created(result, "User provisioned successfully (local dev mode)")
  } catch (error) {
    return handleServiceError(error)
  }
}
