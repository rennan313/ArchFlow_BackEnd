// Instances endpoints are template/demo code that ship with no workspace
// scoping — any authenticated user from any workspace can enumerate all
// instances including IP addresses (cross-tenant exposure).
// Disabled until the Instance model is properly scoped to workspaceId.
import { type NextRequest } from "next/server"

export function GET(_req: NextRequest) {
  return new Response(null, { status: 404 })
}
