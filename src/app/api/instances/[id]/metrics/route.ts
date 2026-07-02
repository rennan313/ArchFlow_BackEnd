import { type NextRequest } from "next/server"

type Context = { params: Promise<Record<string, string>> }

export function GET(_req: NextRequest, _ctx: Context) {
  return new Response(null, { status: 404 })
}
