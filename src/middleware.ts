import { NextResponse, type NextRequest } from "next/server"

// Dynamic CORS with an origin allowlist.
//
// The browser calls this backend directly (the frontend's client-side axios
// uses NEXT_PUBLIC_API_URL = this API), so cross-origin requests need CORS.
// The previous setup hard-coded a SINGLE origin (FRONTEND_URL) as a static
// header in next.config — which cannot cover a domain migration, where the
// old and new frontend domains must BOTH be accepted during the transition.
//
// This middleware echoes the request Origin back only if it is in the
// allowlist (FRONTEND_URL + the comma-separated ALLOWED_ORIGINS env), so
// multiple front-end domains work simultaneously. Read from process.env
// directly (not @/lib/env) to keep the middleware bundle light and avoid its
// prod-required throws at import time.
//
// Auth is Bearer-token, not cookies, so Access-Control-Allow-Credentials is
// intentionally NOT set.

function buildAllowlist(): Set<string> {
  const raw = [process.env.FRONTEND_URL, ...(process.env.ALLOWED_ORIGINS ?? "").split(",")]
  return new Set(raw.map((o) => o?.trim()).filter((o): o is string => !!o))
}

const ALLOW_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
const ALLOW_HEADERS = "Content-Type,Authorization"

function applyCors(res: NextResponse, origin: string): void {
  res.headers.set("Access-Control-Allow-Origin", origin)
  res.headers.set("Vary", "Origin")
  res.headers.set("Access-Control-Allow-Methods", ALLOW_METHODS)
  res.headers.set("Access-Control-Allow-Headers", ALLOW_HEADERS)
  res.headers.set("Access-Control-Max-Age", "86400")
}

export function middleware(req: NextRequest) {
  const origin    = req.headers.get("origin")
  const isAllowed = !!origin && buildAllowlist().has(origin)

  // Preflight — answer directly with 204 + CORS headers (only if allowed).
  if (req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 })
    if (isAllowed && origin) applyCors(res, origin)
    return res
  }

  const res = NextResponse.next()
  if (isAllowed && origin) applyCors(res, origin)
  return res
}

export const config = {
  matcher: "/api/:path*",
}
