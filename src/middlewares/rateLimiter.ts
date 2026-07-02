import { NextResponse, type NextRequest } from "next/server"
import { tooManyRequests } from "@/lib/response"

// ── Distributed rate limiter (production) ─────────────────────────────────────
// Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in production to
// enable distributed limits across all Vercel lambda instances.
// Falls back to in-memory for local dev (single-instance only).

type LimitFn = (req: NextRequest) => Promise<NextResponse | null> | NextResponse | null

let _authLimit:    LimitFn | null = null
let _aiLimit:      LimitFn | null = null
let _advisorLimit: LimitFn | null = null

function getIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")
  return forwarded ? forwarded.split(",")[0].trim() : "unknown"
}

async function initUpstash() {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return false

  try {
    const { Ratelimit } = await import("@upstash/ratelimit")
    const { Redis }     = await import("@upstash/redis")
    const redis         = new Redis({ url, token })

    const authRL    = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "1 m"),  prefix: "rl:auth" })
    const aiRL      = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5,  "10 m"), prefix: "rl:ai" })
    const advisorRL = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "10 m"), prefix: "rl:advisor" })

    _authLimit    = async (req) => { const r = await authRL.limit(getIp(req));    return r.success ? null : tooManyRequests(`Too many requests. Retry in ${Math.ceil(r.reset / 1000)}s`) }
    _aiLimit      = async (req) => { const r = await aiRL.limit(getIp(req));      return r.success ? null : tooManyRequests(`AI generation limit reached. Retry in ${Math.ceil(r.reset / 1000)}s`) }
    _advisorLimit = async (req) => { const r = await advisorRL.limit(getIp(req)); return r.success ? null : tooManyRequests(`Advisor limit reached. Retry in ${Math.ceil(r.reset / 1000)}s`) }
    return true
  } catch {
    return false
  }
}

// ── In-memory fallback (dev / single-instance) ────────────────────────────────
interface RateEntry { count: number; resetAt: number }
const store = new Map<string, RateEntry>()

function checkMemory(req: NextRequest, suffix: string, limit: number, windowMs: number): { allowed: boolean; resetAt: number } {
  const key   = `${getIp(req)}:${suffix}`
  const now   = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, resetAt: now + windowMs }
  }
  if (entry.count >= limit) return { allowed: false, resetAt: entry.resetAt }
  entry.count++
  return { allowed: true, resetAt: entry.resetAt }
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) store.delete(key)
    }
  }, 5 * 60 * 1000)
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
let _initialized = false
async function ensureInit() {
  if (_initialized) return
  _initialized = true
  const ok = await initUpstash()
  if (!ok) {
    // In-memory fallback
    _authLimit    = (req) => { const r = checkMemory(req, "auth",    10,  60_000);      return r.allowed ? null : tooManyRequests(`Too many requests. Retry in ${Math.ceil((r.resetAt - Date.now()) / 1000)}s`) }
    _aiLimit      = (req) => { const r = checkMemory(req, "ai",       5, 600_000);      return r.allowed ? null : tooManyRequests(`AI generation limit reached. Retry in ${Math.ceil((r.resetAt - Date.now()) / 1000)}s`) }
    _advisorLimit = (req) => { const r = checkMemory(req, "advisor", 20, 600_000);      return r.allowed ? null : tooManyRequests(`Advisor limit reached. Retry in ${Math.ceil((r.resetAt - Date.now()) / 1000)}s`) }
  }
}

// ── Public API (same signatures as before — all call sites unchanged) ─────────
export async function authRateLimit(req: NextRequest): Promise<NextResponse | null> {
  await ensureInit()
  return _authLimit!(req)
}

export async function aiRateLimit(req: NextRequest): Promise<NextResponse | null> {
  await ensureInit()
  return _aiLimit!(req)
}

export async function advisorRateLimit(req: NextRequest): Promise<NextResponse | null> {
  await ensureInit()
  return _advisorLimit!(req)
}
