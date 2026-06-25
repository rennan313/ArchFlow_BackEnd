import { NextResponse, type NextRequest } from "next/server"
import { tooManyRequests } from "@/lib/response"

interface RateEntry { count: number; resetAt: number }

// In-memory store — works for single-instance MVP.
// Replace with @upstash/ratelimit for multi-instance production.
const store = new Map<string, RateEntry>()

function getKey(req: NextRequest, suffix: string): string {
  const forwarded = req.headers.get("x-forwarded-for")
  const ip        = forwarded ? forwarded.split(",")[0].trim() : "unknown"
  return `${ip}:${suffix}`
}

function check(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now   = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs }
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt }
}

// Clean up old entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) store.delete(key)
    }
  }, 5 * 60 * 1000)
}

// Auth endpoints: 10 requests per minute per IP
export function authRateLimit(req: NextRequest): NextResponse | null {
  const key    = getKey(req, "auth")
  const result = check(key, 10, 60_000)

  if (!result.allowed) {
    return tooManyRequests(`Too many requests. Try again in ${Math.ceil((result.resetAt - Date.now()) / 1000)}s`)
  }
  return null
}

// AI generation: 5 requests per 10 minutes per IP
export function aiRateLimit(req: NextRequest): NextResponse | null {
  const key    = getKey(req, "ai")
  const result = check(key, 5, 10 * 60_000)

  if (!result.allowed) {
    return tooManyRequests(`AI generation limit reached. Try again in ${Math.ceil((result.resetAt - Date.now()) / 1000)}s`)
  }
  return null
}

// Proposal advisor: deterministic, no LLM call — looser limit than aiRateLimit,
// just enough to stop accidental hammering. 20 requests per 10 minutes per IP.
export function advisorRateLimit(req: NextRequest): NextResponse | null {
  const key    = getKey(req, "advisor")
  const result = check(key, 20, 10 * 60_000)

  if (!result.allowed) {
    return tooManyRequests(`Advisor limit reached. Try again in ${Math.ceil((result.resetAt - Date.now()) / 1000)}s`)
  }
  return null
}
