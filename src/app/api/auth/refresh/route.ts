// This endpoint is no longer used — authentication is handled by NextAuth on the frontend.
// JWT refresh is implicit: JWT_EXPIRES_IN is now 7d, matching the NextAuth session duration.
import { type NextRequest } from "next/server"
import { notFound } from "@/lib/response"

export async function POST(_req: NextRequest) {
  return notFound("This endpoint has been deprecated. Use NextAuth session management.")
}
